import { useState, useEffect, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

interface AdminAuthState {
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
}

const useAdminAuth = () => {
  const [state, setState] = useState<AdminAuthState>({
    isAdmin: false,
    isLoading: true,
    error: null,
  });

  const checkAdminRole = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (!idToken) {
        setState({ isAdmin: false, isLoading: false, error: null });
        return;
      }

      // Get the custom:role attribute from the ID token payload
      const payload = idToken.payload;
      const role = payload['custom:role'] as string | undefined;

      setState({
        isAdmin: role === 'admin',
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        isAdmin: false,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    }
  }, []);

  useEffect(() => {
    checkAdminRole();
  }, [checkAdminRole]);

  return {
    ...state,
    refetch: checkAdminRole,
  };
};

export default useAdminAuth;
