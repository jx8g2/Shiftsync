import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getToken } from '../utils/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const token = getToken();
        if (!token || !user) {
            if (socket) {
                console.log('🔌 Disconnecting socket due to missing token/user');
                socket.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        console.log('🔌 Attempting WebSocket connection to:', window.location.origin);
        const newSocket = io(window.location.origin, {
            auth: { token },
            path: '/socket.io/',
            transports: ['websocket', 'polling'], // Fallback options
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        newSocket.on('connect', () => {
            console.log('✅ Connected to WebSocket');
            setIsConnected(true);
        });

        newSocket.on('disconnect', () => {
            console.log('🔌 Disconnected from WebSocket');
            setIsConnected(false);
        });

        newSocket.on('connect_error', (err) => {
            console.error('❌ WebSocket connection error:', err.message);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [user]);

    const value = {
        socket,
        isConnected
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
}

// Custom hook to listen for socket events
export function useSocketEvent(event, callback) {
    const { socket } = useSocket();

    useEffect(() => {
        if (!socket) return;

        socket.on(event, callback);
        return () => {
            socket.off(event, callback);
        };
    }, [socket, event, callback]);
}

export default SocketContext;
