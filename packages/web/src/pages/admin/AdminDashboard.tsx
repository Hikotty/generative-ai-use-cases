import React from 'react';
import { useTranslation } from 'react-i18next';

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">{t('admin.dashboard.title')}</h1>
      <p className="text-gray-600">{t('admin.dashboard.description')}</p>
    </div>
  );
};

export default AdminDashboard;
