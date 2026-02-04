/**
 * User Management Page Component
 *
 * Displays a list of users with search and pagination functionality.
 *
 * Requirements:
 * - 3.1: Display user list with email, role, status, created date
 * - 3.2: Show 50 users per page
 * - 3.3: Search users by email
 * - 3.4: Pagination with next/previous buttons
 * - 3.5: Create new user with email address
 * - 3.6: Set admin role when creating user
 * - 3.7: Disable user account
 * - 3.8: Enable user account
 * - 3.9: Delete user (with confirmation dialog)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  TextInput,
  Button,
  Card,
  Dialog,
  DialogPanel,
  Switch,
} from '@tremor/react';
import {
  PiMagnifyingGlass,
  PiCaretLeft,
  PiCaretRight,
  PiUserPlus,
  PiX,
  PiShieldCheck,
  PiShieldSlash,
  PiTrash,
  PiProhibit,
  PiCheckCircle,
  PiDownloadSimple,
  PiExport,
  PiUploadSimple,
} from 'react-icons/pi';
import { toast } from 'sonner';
import useAdminApi, { UserResponse } from '../../hooks/useAdminApi';
import { useDebounce } from 'use-debounce';
import { downloadUserImportTemplate, downloadUserExportCSV } from '../../utils/csvUtils';
import BulkImportDialog from '../../components/admin/BulkImportDialog';

// Page size constant - 50 users per page as per requirement 3.2
const PAGE_SIZE = 50;

/**
 * UserTable component displays users in a Tremor Table
 */
interface UserTableProps {
  users: UserResponse[];
  isLoading: boolean;
  onGrantAdmin: (user: UserResponse) => void;
  onRevokeAdmin: (user: UserResponse) => void;
  onDisableUser: (user: UserResponse) => void;
  onEnableUser: (user: UserResponse) => void;
  onDeleteUser: (user: UserResponse) => void;
  actionInProgress: string | null;
}

const UserTable: React.FC<UserTableProps> = ({
  users,
  isLoading,
  onGrantAdmin,
  onRevokeAdmin,
  onDisableUser,
  onEnableUser,
  onDeleteUser,
  actionInProgress,
}) => {
  const { t } = useTranslation();

  /**
   * Format date to locale string
   */
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Get badge color based on user status
   */
  const getStatusColor = (status: string): 'green' | 'red' | 'gray' => {
    switch (status) {
      case 'active':
        return 'green';
      case 'disabled':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-aws-smile border-t-transparent" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        {t('admin.users.no_users_found')}
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{t('admin.users.table.email')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.users.table.role')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.users.table.status')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.users.table.created_at')}</TableHeaderCell>
          <TableHeaderCell>{t('admin.users.table.actions')}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {users.map((user) => {
          const isActionInProgress = actionInProgress === user.userId;
          return (
            <TableRow key={user.userId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900">{user.email}</span>
                  <span className="text-xs text-gray-500">{user.userId}</span>
                </div>
              </TableCell>
              <TableCell>
                {user.isAdmin ? (
                  <Badge color="amber">{t('admin.users.role.admin')}</Badge>
                ) : (
                  <Badge color="gray">{t('admin.users.role.user')}</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge color={getStatusColor(user.status)}>
                  {t(`admin.users.status.${user.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-gray-500">
                {formatDate(user.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {/* Grant/Revoke Admin Button */}
                  {user.isAdmin ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={PiShieldSlash}
                      onClick={() => onRevokeAdmin(user)}
                      disabled={isActionInProgress}
                      loading={isActionInProgress}
                      tooltip={t('admin.users.actions.revoke_admin')}
                      className="text-amber-600 hover:text-amber-700">
                      {t('admin.users.actions.revoke_admin_short')}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={PiShieldCheck}
                      onClick={() => onGrantAdmin(user)}
                      disabled={isActionInProgress}
                      loading={isActionInProgress}
                      tooltip={t('admin.users.actions.grant_admin')}
                      className="text-amber-600 hover:text-amber-700">
                      {t('admin.users.actions.grant_admin_short')}
                    </Button>
                  )}

                  {/* Enable/Disable Button */}
                  {user.status === 'active' ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={PiProhibit}
                      onClick={() => onDisableUser(user)}
                      disabled={isActionInProgress}
                      loading={isActionInProgress}
                      tooltip={t('admin.users.actions.disable')}
                      className="text-orange-600 hover:text-orange-700">
                      {t('admin.users.actions.disable_short')}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={PiCheckCircle}
                      onClick={() => onEnableUser(user)}
                      disabled={isActionInProgress}
                      loading={isActionInProgress}
                      tooltip={t('admin.users.actions.enable')}
                      className="text-green-600 hover:text-green-700">
                      {t('admin.users.actions.enable_short')}
                    </Button>
                  )}

                  {/* Delete Button */}
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={PiTrash}
                    onClick={() => onDeleteUser(user)}
                    disabled={isActionInProgress}
                    loading={isActionInProgress}
                    tooltip={t('admin.users.actions.delete')}
                    className="text-red-600 hover:text-red-700">
                    {t('admin.users.actions.delete_short')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

/**
 * Pagination component for navigating through user pages
 */
interface PaginationProps {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  totalCount?: number;
  pageSize: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  totalCount,
  pageSize,
}) => {
  const { t } = useTranslation();

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = totalCount
    ? Math.min(currentPage * pageSize, totalCount)
    : currentPage * pageSize;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          variant="secondary"
          disabled={!hasPreviousPage}
          onClick={onPreviousPage}
          icon={PiCaretLeft}>
          {t('admin.users.pagination.previous')}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasNextPage}
          onClick={onNextPage}
          icon={PiCaretRight}
          iconPosition="right">
          {t('admin.users.pagination.next')}
        </Button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            {totalCount !== undefined ? (
              <>
                {t('admin.users.pagination.showing')}{' '}
                <span className="font-medium">{startItem}</span>{' '}
                {t('admin.users.pagination.to')}{' '}
                <span className="font-medium">{endItem}</span>{' '}
                {t('admin.users.pagination.of')}{' '}
                <span className="font-medium">{totalCount}</span>{' '}
                {t('admin.users.pagination.results')}
              </>
            ) : (
              <>
                {t('admin.users.pagination.page')}{' '}
                <span className="font-medium">{currentPage}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!hasPreviousPage}
            onClick={onPreviousPage}
            icon={PiCaretLeft}>
            {t('admin.users.pagination.previous')}
          </Button>
          <Button
            variant="secondary"
            disabled={!hasNextPage}
            onClick={onNextPage}
            icon={PiCaretRight}
            iconPosition="right">
            {t('admin.users.pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Email validation regex pattern
 * Validates standard email format: local@domain.tld
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email.trim());
};

/**
 * CreateUserDialog component for creating new users
 *
 * Requirements:
 * - 3.5: Create new user with email address
 * - 3.6: Set admin role when creating user
 */
interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserDialog: React.FC<CreateUserDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Form state
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  /**
   * Reset form state when dialog opens/closes
   */
  const resetForm = useCallback(() => {
    setEmail('');
    setIsAdmin(false);
    setError(null);
    setEmailError(null);
    setIsSubmitting(false);
  }, []);

  /**
   * Handle dialog close
   */
  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  }, [isSubmitting, resetForm, onClose]);

  /**
   * Validate email on blur
   */
  const handleEmailBlur = useCallback(() => {
    if (email.trim() && !isValidEmail(email)) {
      setEmailError(t('admin.users.create_dialog.email_invalid'));
    } else {
      setEmailError(null);
    }
  }, [email, t]);

  /**
   * Handle email input change
   */
  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
      // Clear email error when user starts typing
      if (emailError) {
        setEmailError(null);
      }
      // Clear general error when user modifies form
      if (error) {
        setError(null);
      }
    },
    [emailError, error]
  );

  /**
   * Handle admin toggle change
   */
  const handleAdminToggle = useCallback((checked: boolean) => {
    setIsAdmin(checked);
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate email
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setEmailError(t('admin.users.create_dialog.email_required'));
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        setEmailError(t('admin.users.create_dialog.email_invalid'));
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await adminApi.createUser({
          email: trimmedEmail,
          isAdmin,
        });

        // Success - close dialog and trigger refresh
        resetForm();
        onSuccess();
        onClose();
      } catch (err) {
        setError(adminApi.getErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, isAdmin, adminApi, resetForm, onSuccess, onClose, t]
  );

  return (
    <Dialog open={isOpen} onClose={handleClose} static={true}>
      <DialogPanel className="max-w-md">
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('admin.users.create_dialog.title')}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700">
              {t('admin.users.create_dialog.email_label')}
            </label>
            <TextInput
              id="email"
              type="email"
              placeholder={t('admin.users.create_dialog.email_placeholder')}
              value={email}
              onChange={handleEmailChange}
              onBlur={handleEmailBlur}
              disabled={isSubmitting}
              error={!!emailError}
              errorMessage={emailError || undefined}
              className="mt-1"
            />
          </div>

          {/* Admin Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <label
                htmlFor="isAdmin"
                className="block text-sm font-medium text-gray-700">
                {t('admin.users.create_dialog.admin_label')}
              </label>
              <p className="text-xs text-gray-500">
                {t('admin.users.create_dialog.admin_description')}
              </p>
            </div>
            <Switch
              id="isAdmin"
              checked={isAdmin}
              onChange={handleAdminToggle}
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}>
              {t('admin.users.create_dialog.cancel')}
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || !email.trim()}>
              {t('admin.users.create_dialog.create')}
            </Button>
          </div>
        </form>
      </DialogPanel>
    </Dialog>
  );
};

/**
 * DeleteUserDialog component for confirming user deletion
 *
 * Requirements:
 * - 3.9: Delete user (with confirmation dialog)
 */
interface DeleteUserDialogProps {
  isOpen: boolean;
  user: UserResponse | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteUserDialog: React.FC<DeleteUserDialogProps> = ({
  isOpen,
  user,
  onClose,
  onConfirm,
  isDeleting,
}) => {
  const { t } = useTranslation();

  const handleClose = useCallback(() => {
    if (!isDeleting) {
      onClose();
    }
  }, [isDeleting, onClose]);

  return (
    <Dialog open={isOpen} onClose={handleClose} static={true}>
      <DialogPanel className="max-w-md">
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('admin.users.delete_dialog.title')}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            <PiX className="h-5 w-5" />
          </button>
        </div>

        {/* Confirmation Message */}
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600">
            {t('admin.users.delete_dialog.message')}
          </p>
          {user && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="font-medium text-gray-900">{user.email}</p>
              <p className="text-xs text-gray-500">{user.userId}</p>
            </div>
          )}
          <p className="text-sm text-red-600">
            {t('admin.users.delete_dialog.warning')}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isDeleting}>
            {t('admin.users.delete_dialog.cancel')}
          </Button>
          <Button
            type="button"
            color="red"
            onClick={onConfirm}
            loading={isDeleting}
            disabled={isDeleting}>
            {t('admin.users.delete_dialog.confirm')}
          </Button>
        </div>
      </DialogPanel>
    </Dialog>
  );
};

/**
 * Main UserManagement page component
 */
const UserManagement: React.FC = () => {
  const { t } = useTranslation();
  const adminApi = useAdminApi();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  // Create user dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Delete user dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // CSV export state
  const [isExporting, setIsExporting] = useState(false);

  // Bulk import dialog state
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);

  // Action in progress state (for disabling buttons during API calls)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Pagination state - store tokens for each page
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Get current page token
  const currentToken = pageTokens[currentPageIndex];

  // Fetch users with SWR
  const { data, error, isLoading, mutate } = adminApi.listUsers(
    {
      search: debouncedSearch || undefined,
      nextToken: currentToken,
      limit: PAGE_SIZE,
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // Handle create user dialog open
  const handleOpenCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  // Handle create user dialog close
  const handleCloseCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(false);
  }, []);

  // Handle successful user creation - refresh the list
  const handleCreateSuccess = useCallback(() => {
    // Reset to first page and refresh
    setPageTokens([undefined]);
    setCurrentPageIndex(0);
    mutate();
    toast.success(t('admin.users.toast.user_created'));
  }, [mutate, t]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      // Reset pagination when search changes
      setPageTokens([undefined]);
      setCurrentPageIndex(0);
    },
    []
  );

  // Handle next page
  const handleNextPage = useCallback(() => {
    if (data?.nextToken) {
      // Store the next token if we haven't visited this page yet
      if (currentPageIndex === pageTokens.length - 1) {
        setPageTokens((prev) => [...prev, data.nextToken]);
      }
      setCurrentPageIndex((prev) => prev + 1);
    }
  }, [data?.nextToken, currentPageIndex, pageTokens.length]);

  // Handle previous page
  const handlePreviousPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex((prev) => prev - 1);
    }
  }, [currentPageIndex]);

  /**
   * Handle granting admin role to a user
   * Requirement 3.6: Grant admin role
   */
  const handleGrantAdmin = useCallback(
    async (user: UserResponse) => {
      setActionInProgress(user.userId);
      try {
        await adminApi.updateUser(user.userId, { isAdmin: true });
        toast.success(t('admin.users.toast.admin_granted', { email: user.email }));
        mutate();
      } catch (err) {
        toast.error(adminApi.getErrorMessage(err));
      } finally {
        setActionInProgress(null);
      }
    },
    [adminApi, mutate, t]
  );

  /**
   * Handle revoking admin role from a user
   * Requirement 3.6: Revoke admin role
   */
  const handleRevokeAdmin = useCallback(
    async (user: UserResponse) => {
      setActionInProgress(user.userId);
      try {
        await adminApi.updateUser(user.userId, { isAdmin: false });
        toast.success(t('admin.users.toast.admin_revoked', { email: user.email }));
        mutate();
      } catch (err) {
        toast.error(adminApi.getErrorMessage(err));
      } finally {
        setActionInProgress(null);
      }
    },
    [adminApi, mutate, t]
  );

  /**
   * Handle disabling a user account
   * Requirement 3.7: Disable user account
   */
  const handleDisableUser = useCallback(
    async (user: UserResponse) => {
      setActionInProgress(user.userId);
      try {
        await adminApi.updateUser(user.userId, { enabled: false });
        toast.success(t('admin.users.toast.user_disabled', { email: user.email }));
        mutate();
      } catch (err) {
        toast.error(adminApi.getErrorMessage(err));
      } finally {
        setActionInProgress(null);
      }
    },
    [adminApi, mutate, t]
  );

  /**
   * Handle enabling a user account
   * Requirement 3.8: Enable user account
   */
  const handleEnableUser = useCallback(
    async (user: UserResponse) => {
      setActionInProgress(user.userId);
      try {
        await adminApi.updateUser(user.userId, { enabled: true });
        toast.success(t('admin.users.toast.user_enabled', { email: user.email }));
        mutate();
      } catch (err) {
        toast.error(adminApi.getErrorMessage(err));
      } finally {
        setActionInProgress(null);
      }
    },
    [adminApi, mutate, t]
  );

  /**
   * Handle opening delete confirmation dialog
   * Requirement 3.9: Delete user (with confirmation dialog)
   */
  const handleOpenDeleteDialog = useCallback((user: UserResponse) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  }, []);

  /**
   * Handle closing delete confirmation dialog
   */
  const handleCloseDeleteDialog = useCallback(() => {
    if (!isDeleting) {
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  }, [isDeleting]);

  /**
   * Handle confirming user deletion
   * Requirement 3.9: Delete user (with confirmation dialog)
   */
  const handleConfirmDelete = useCallback(async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      await adminApi.deleteUser(userToDelete.userId);
      toast.success(t('admin.users.toast.user_deleted', { email: userToDelete.email }));
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      mutate();
    } catch (err) {
      toast.error(adminApi.getErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  }, [userToDelete, adminApi, mutate, t]);

  /**
   * Handle CSV export of all users
   * Requirements:
   * - 3.11: Export user list to CSV
   * - 3.14: CSV export includes all user data (email, role, status, created date)
   * - 3.15: CSV filename includes export date
   * - 16.4: CSV export has header row
   * - 16.5: CSV export includes all users (paginate through all pages)
   * - 16.6: CSV export is UTF-8 encoded with BOM
   * - 16.7: CSV export filename format: users_YYYY-MM-DD.csv
   */
  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      // Fetch all users by paginating through all pages
      const allUsers = await adminApi.fetchAllUsers();
      
      // Convert to export format and download
      const exportData = allUsers.map((user) => ({
        email: user.email,
        isAdmin: user.isAdmin,
        status: user.status,
        createdAt: user.createdAt,
      }));
      
      downloadUserExportCSV(exportData);
      toast.success(t('admin.users.toast.export_success', { count: allUsers.length }));
    } catch (err) {
      toast.error(adminApi.getErrorMessage(err));
    } finally {
      setIsExporting(false);
    }
  }, [adminApi, t]);

  /**
   * Handle opening bulk import dialog
   * Requirement 3.12: Upload CSV file for bulk user import
   */
  const handleOpenBulkImportDialog = useCallback(() => {
    setIsBulkImportDialogOpen(true);
  }, []);

  /**
   * Handle closing bulk import dialog
   */
  const handleCloseBulkImportDialog = useCallback(() => {
    setIsBulkImportDialogOpen(false);
  }, []);

  /**
   * Handle successful bulk import - refresh the list
   * Requirement 3.12, 3.13: Bulk import with result display
   */
  const handleBulkImportSuccess = useCallback(() => {
    // Reset to first page and refresh
    setPageTokens([undefined]);
    setCurrentPageIndex(0);
    mutate();
  }, [mutate]);

  // Compute pagination state
  const hasNextPage = !!data?.nextToken;
  const hasPreviousPage = currentPageIndex > 0;
  const currentPage = currentPageIndex + 1;

  // Get users from response
  const users = useMemo(() => data?.users ?? [], [data?.users]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('admin.users.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('admin.users.description')}
        </p>
      </div>

      {/* Search and Actions */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="w-full sm:max-w-md">
            <TextInput
              icon={PiMagnifyingGlass}
              placeholder={t('admin.users.search_placeholder')}
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={PiExport}
              onClick={handleExportCSV}
              loading={isExporting}
              disabled={isExporting}>
              {t('admin.users.export_csv_button')}
            </Button>
            <Button
              variant="secondary"
              icon={PiDownloadSimple}
              onClick={downloadUserImportTemplate}>
              {t('admin.users.download_template_button')}
            </Button>
            <Button
              variant="secondary"
              icon={PiUploadSimple}
              onClick={handleOpenBulkImportDialog}>
              {t('admin.users.bulk_import_button')}
            </Button>
            <Button icon={PiUserPlus} onClick={handleOpenCreateDialog}>
              {t('admin.users.create_button')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Create User Dialog */}
      <CreateUserDialog
        isOpen={isCreateDialogOpen}
        onClose={handleCloseCreateDialog}
        onSuccess={handleCreateSuccess}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        isOpen={isDeleteDialogOpen}
        user={userToDelete}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        isOpen={isBulkImportDialogOpen}
        onClose={handleCloseBulkImportDialog}
        onSuccess={handleBulkImportSuccess}
      />

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-red-700">
            {adminApi.getErrorMessage(error)}
          </p>
        </Card>
      )}

      {/* User Table */}
      <Card className="overflow-hidden p-0">
        <UserTable
          users={users}
          isLoading={isLoading}
          onGrantAdmin={handleGrantAdmin}
          onRevokeAdmin={handleRevokeAdmin}
          onDisableUser={handleDisableUser}
          onEnableUser={handleEnableUser}
          onDeleteUser={handleOpenDeleteDialog}
          actionInProgress={actionInProgress}
        />

        {/* Pagination */}
        {users.length > 0 && (
          <Pagination
            currentPage={currentPage}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
            totalCount={data?.totalCount}
            pageSize={PAGE_SIZE}
          />
        )}
      </Card>
    </div>
  );
};

export default UserManagement;
