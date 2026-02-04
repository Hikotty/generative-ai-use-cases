import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PiHouse,
  PiUsers,
  PiFileText,
  PiChartLine,
  PiChartBar,
  PiGear,
  PiRocket,
  PiFiles,
} from 'react-icons/pi';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  labelKey: string;
  show?: boolean;
}

interface AdminSidebarProps {
  ragEnabled?: boolean;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ ragEnabled = true }) => {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      to: '/admin',
      icon: <PiHouse className="h-5 w-5" />,
      labelKey: 'admin.navigation.dashboard',
    },
    {
      to: '/admin/users',
      icon: <PiUsers className="h-5 w-5" />,
      labelKey: 'admin.navigation.users',
    },
    {
      to: '/admin/logs',
      icon: <PiFileText className="h-5 w-5" />,
      labelKey: 'admin.navigation.logs',
    },
    {
      to: '/admin/stats',
      icon: <PiChartBar className="h-5 w-5" />,
      labelKey: 'admin.navigation.stats',
    },
    {
      to: '/admin/settings',
      icon: <PiGear className="h-5 w-5" />,
      labelKey: 'admin.navigation.settings',
    },
    {
      to: '/admin/rag',
      icon: <PiFiles className="h-5 w-5" />,
      labelKey: 'admin.navigation.rag',
      show: ragEnabled,
    },
    {
      to: '/admin/deploy',
      icon: <PiRocket className="h-5 w-5" />,
      labelKey: 'admin.navigation.deploy',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="bg-aws-squid-ink fixed left-0 top-0 z-40 h-screen w-64 overflow-y-auto">
      <div className="flex h-full flex-col">
        {/* Logo / Title */}
        <div className="flex h-16 items-center border-b border-gray-700 px-4">
          <NavLink to="/admin" className="flex items-center gap-2">
            <PiChartLine className="h-6 w-6 text-white" />
            <span className="text-lg font-semibold text-white">
              {t('admin.dashboard.title')}
            </span>
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {navItems
              .filter((item) => item.show !== false)
              .map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive: navIsActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        navIsActive || isActive(item.to)
                          ? 'bg-aws-smile text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`
                    }>
                    {item.icon}
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>

        {/* Back to main app link */}
        <div className="border-t border-gray-700 p-4">
          <NavLink
            to="/"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
            {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
            <span>← {t('admin.forbidden.back_to_home')}</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
