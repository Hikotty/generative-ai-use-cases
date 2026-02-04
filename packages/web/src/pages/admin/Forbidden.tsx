import React from 'react';
import { useTranslation } from 'react-i18next';
import { PiShieldWarning } from 'react-icons/pi';
import { Link } from 'react-router-dom';

const Forbidden: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <PiShieldWarning className="text-red-500 mb-4 text-8xl" />
      {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
      <h1 className="mb-2 text-5xl font-bold">403</h1>
      <h2 className="text-aws-smile mb-4 text-xl">
        {t('admin.forbidden.title')}
      </h2>
      <p className="text-gray-600 mb-6 text-center">
        {t('admin.forbidden.message')}
      </p>
      <Link
        to="/"
        className="bg-aws-smile hover:bg-aws-smile/80 rounded px-6 py-2 text-white transition-colors">
        {t('admin.forbidden.back_to_home')}
      </Link>
    </div>
  );
};

export default Forbidden;
