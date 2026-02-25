import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { storesAPI } from '../utils/api';

const StoreFilterContext = createContext(null);

export function StoreFilterProvider({ children }) {
    const { user, loading } = useAuth();
    const [stores, setStores] = useState([]);
    const [selectedStoreId, setSelectedStoreId] = useState('all');

    // Effect 1: Load from localStorage only once auth is initialized
    useEffect(() => {
        if (!loading && user?.role === 'admin') {
            const saved = localStorage.getItem('shiftsync_admin_selected_store');
            if (saved) setSelectedStoreId(saved);
        }
    }, [loading, user]);

    // Effect 2: Save selection to localStorage (only for admins)
    useEffect(() => {
        if (!loading && user?.role === 'admin') {
            localStorage.setItem('shiftsync_admin_selected_store', selectedStoreId);
        }
    }, [selectedStoreId, user, loading]);

    // Effect 3: Clear selection strictly on logout (no loading)
    useEffect(() => {
        if (!loading && !user) {
            localStorage.removeItem('shiftsync_admin_selected_store');
            setSelectedStoreId('all');
        }
    }, [user, loading]);

    // Fetch stores (admin only)
    useEffect(() => {
        if (user?.role === 'admin') {
            fetchStores();
        }
    }, [user]);

    const fetchStores = async () => {
        try {
            const res = await storesAPI.getAll();
            if (res.success) {
                setStores(res.stores);

                // If we have a persisted selection that is no longer valid (e.g. store deleted), reset it
                // Except for 'all' which is always valid
                if (selectedStoreId !== 'all' && res.stores.length > 0) {
                    const storeExists = res.stores.some(s => s.id == selectedStoreId);
                    if (!storeExists) {
                        setSelectedStoreId(res.stores.length === 1 ? res.stores[0].id : 'all');
                    }
                } else if (res.stores.length === 1 && (selectedStoreId === 'all' || !selectedStoreId)) {
                    // Default to first store if only one exists
                    setSelectedStoreId(res.stores[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch stores:', err);
        }
    };

    // effectiveStoreId:
    // - Admin: the selected store (null when "all" is chosen)
    // - Manager: always their own storeId
    // - Employee: their storeId
    const effectiveStoreId = user?.role === 'admin'
        ? (selectedStoreId === 'all' ? null : selectedStoreId)
        : user?.storeId || null;

    const value = {
        stores,
        selectedStoreId,
        setSelectedStoreId,
        effectiveStoreId,
        isAllStores: selectedStoreId === 'all' && user?.role === 'admin',
        refreshStores: fetchStores
    };

    return (
        <StoreFilterContext.Provider value={value}>
            {children}
        </StoreFilterContext.Provider>
    );
}

export function useStoreFilter() {
    const context = useContext(StoreFilterContext);
    if (!context) {
        // Return safe defaults if not within provider
        return {
            stores: [],
            selectedStoreId: 'all',
            setSelectedStoreId: () => { },
            effectiveStoreId: null,
            isAllStores: false,
            refreshStores: () => { }
        };
    }
    return context;
}

export default StoreFilterContext;
