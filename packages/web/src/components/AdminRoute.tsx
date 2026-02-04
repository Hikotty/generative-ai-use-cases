import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAdminAuth from '../hooks/useAdminAuth';

const AdminRoute: React.FC = () => {
  const { t } = useTranslation();
  const { isAdmin, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin/forbidden" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
