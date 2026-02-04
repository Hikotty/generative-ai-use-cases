import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PiUser, PiSignOut, PiList, PiX } from 'react-icons/pi';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';

interface AdminHeaderProps {
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({
  onMenuToggle,
  isMenuOpen,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const getUserInfo = async () => {
      try {
        const attributes = await fetchUserAttributes();
        setUserEmail(attributes.email || '');
      } catch (error) {
        console.error('Failed to fetch user attributes:', error);
      }
    };
    getUserInfo();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30 lg:left-64">
      <div className="flex h-16 items-center justify-between px-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
          {isMenuOpen ? (
            <PiX className="h-6 w-6" />
          ) : (
            <PiList className="h-6 w-6" />
          )}
        </button>

        {/* Page title - visible on mobile */}
        <h1 className="lg:hidden text-lg font-semibold text-gray-900">
          {t('admin.dashboard.title')}
        </h1>

        {/* Spacer for desktop */}
        <div className="hidden lg:block" />

        {/* User info and actions */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-aws-smile text-white">
              <PiUser className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline-block max-w-[200px] truncate">
              {userEmail}
            </span>
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsDropdownOpen(false)}
              />
              {/* Dropdown */}
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5">
                <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                  <div className="font-medium text-gray-900 truncate">
                    {userEmail}
                  </div>
                  {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
                  <div className="text-xs text-aws-smile">Admin</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <PiSignOut className="h-4 w-4" />
                  <span>{t('setting.signout')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
