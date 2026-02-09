import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
    };

    return (
        <div className="app-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
            <Header onMenuClick={toggleSidebar} />
            <main className="main-content">
                <Outlet />
            </main>
            {isSidebarOpen && (
                <div className="sidebar-overlay" onClick={closeSidebar}></div>
            )}
        </div>
    );
}

export default Layout;
