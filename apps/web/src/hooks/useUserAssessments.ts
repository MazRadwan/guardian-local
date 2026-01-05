/**
 * Hook: useUserAssessments
 *
 * Fetches user's assessment status to determine if scoring mode should be visible.
 * Scoring mode is shown if user has any assessment with status >= 'exported'.
 *
 * This is persistence-based (not session-based), so it survives browser refresh.
 */

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

interface UseUserAssessmentsResult {
  hasExportedAssessments: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useUserAssessments(): UseUserAssessmentsResult {
  const [hasExportedAssessments, setHasExportedAssessments] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    // Don't fetch if no token
    if (!token) {
      setHasExportedAssessments(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function checkStatus() {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/assessments/status`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to check assessment status: ${response.statusText}`);
        }

        const data = await response.json();

        if (isMounted) {
          setHasExportedAssessments(data.hasExportedAssessments ?? false);
        }
      } catch (err) {
        console.error('[useUserAssessments] Error fetching status:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setHasExportedAssessments(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return {
    hasExportedAssessments,
    isLoading,
    error,
  };
}
