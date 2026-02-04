import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';

interface AdminLayoutProps {
  ragEnabled?: boolean;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ ragEnabled = true }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar - hidden on mobile, visible on desktop */}
      <div
        className={`fixed inset-0 z-40 lg:z-auto transition-opacity duration-300 lg:opacity-100 ${
          isMobileMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none lg:pointer-events-auto'
        }`}>
        {/* Mobile backdrop */}
        <div
          className="absolute inset-0 bg-gray-900/50 lg:hidden"
          onClick={toggleMobileMenu}
        />
        {/* Sidebar */}
        <div
          className={`relative transform transition-transform duration-300 lg:transform-none ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}>
          <AdminSidebar ragEnabled={ragEnabled} />
        </div>
      </div>

      {/* Header */}
      <AdminHeader
        onMenuToggle={toggleMobileMenu}
        isMenuOpen={isMobileMenuOpen}
      />

      {/* Main content */}
      <main className="lg:ml-64 pt-16">
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
