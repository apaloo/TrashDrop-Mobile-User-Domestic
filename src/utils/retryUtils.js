/**
 * Retry utilities with exponential backoff for database operations
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determine if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should be retried
 */
const isRetryableError = (error) => {
  if (!error) return false;
  
  // Network connectivity issues
  if (error.message?.includes('fetch')) return true;
  if (error.message?.includes('network')) return true;
  if (error.message?.includes('timeout')) return true;
  if (error.message?.includes('connection')) return true;
  
  // Supabase specific retryable errors
  if (error.code === 'NETWORK_ERROR') return true;
  if (error.code === 'TIMEOUT') return true;
  if (error.code === '08003') return true; // Connection does not exist
  if (error.code === '08006') return true; // Connection failure
  if (error.code === '08001') return true; // Unable to connect
  
  // HTTP status codes that are retryable
  if (error.status === 408) return true; // Request Timeout
  if (error.status === 429) return true; // Too Many Requests
  if (error.status === 500) return true; // Internal Server Error
  if (error.status === 502) return true; // Bad Gateway
  if (error.status === 503) return true; // Service Unavailable
  if (error.status === 504) return true; // Gateway Timeout
  
  return false;
};

/**
 * Determine if an error is permanent (should not be retried)
 * @param {Error} error - Error to check
 * @returns {boolean} True if error should not be retried
 */
const isPermanentError = (error) => {
  if (!error) return false;
  
  // Authentication/authorization errors
  if (error.status === 401) return true; // Unauthorized
  if (error.status === 403) return true; // Forbidden
  if (error.message?.includes('JWT')) return true;
  if (error.message?.includes('unauthorized')) return true;
  if (error.message?.includes('permission')) return true;
  
  // RLS policy violations (PostgreSQL error code 42501)
  if (error.code === '42501') return true; // Insufficient privilege
  if (error.message?.includes('row-level security policy')) return true;
  
  // Schema/validation errors
  if (error.status === 400 && error.message?.includes('violates')) return true;
  if (error.status === 400 && error.message?.includes('constraint')) return true;
  if (error.status === 400 && error.message?.includes('column')) return true;
  if (error.status === 400 && error.message?.includes('schema')) return true;
  
  // Client errors that shouldn't be retried
  if (error.status === 404) return true; // Not Found
  if (error.status === 409) return true; // Conflict
  if (error.status === 422) return true; // Unprocessable Entity
  
  return false;
};

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {number} jitter - Jitter factor 0-1 (default: 0.1)
 * @returns {number} Delay in milliseconds
 */
const calculateBackoffDelay = (attempt, baseDelay = 1000, maxDelay = 30000, jitter = 0.1) => {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Apply maximum delay cap
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitterAmount = cappedDelay * jitter * Math.random();
  const finalDelay = cappedDelay + jitterAmount;
  
  return Math.floor(finalDelay);
};

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {number} options.jitter - Jitter factor 0-1 (default: 0.1)
 * @param {Function} options.onRetry - Callback called before each retry
 * @param {string} options.operationName - Name of operation for logging
 * @returns {Promise} Promise that resolves with the function result
 */
const retryWithBackoff = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = 0.1,
    onRetry = null,
    operationName = 'operation'
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`[RetryUtils] Attempting ${operationName} (attempt ${attempt + 1}/${maxAttempts})`);
      
      const result = await fn();
      
      if (attempt > 0) {
        console.log(`[RetryUtils] ${operationName} succeeded after ${attempt + 1} attempts`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      console.error(`[RetryUtils] ${operationName} failed on attempt ${attempt + 1}:`, error.message);
      
      // Check if error is permanent (should not retry)
      if (isPermanentError(error)) {
        console.error(`[RetryUtils] Permanent error detected for ${operationName}, not retrying:`, error.message);
        throw error;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.error(`[RetryUtils] Non-retryable error detected for ${operationName}:`, error.message);
        throw error;
      }
      
      // Don't retry on the last attempt
      if (attempt === maxAttempts - 1) {
        console.error(`[RetryUtils] ${operationName} failed after ${maxAttempts} attempts`);
        throw error;
      }
      
      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay, jitter);
      console.log(`[RetryUtils] Retrying ${operationName} in ${delay}ms...`);
      
      // Call onRetry callback if provided
      if (onRetry) {
        try {
          await onRetry(attempt + 1, error, delay);
        } catch (callbackError) {
          console.warn(`[RetryUtils] onRetry callback failed:`, callbackError);
        }
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Retry specifically for Supabase operations
 * @param {Function} fn - Async Supabase operation function
 * @param {Object} options - Retry options (extends retryWithBackoff options)
 * @returns {Promise} Promise that resolves with the operation result
 */
const retrySupabaseOperation = async (fn, options = {}) => {
  const defaultOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 15000, // Shorter max delay for database operations
    jitter: 0.2,
    operationName: 'Supabase operation'
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return retryWithBackoff(fn, mergedOptions);
};

/**
 * Retry for network/API operations with longer delays
 * @param {Function} fn - Async network operation function
 * @param {Object} options - Retry options (extends retryWithBackoff options)
 * @returns {Promise} Promise that resolves with the operation result
 */
const retryNetworkOperation = async (fn, options = {}) => {
  const defaultOptions = {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 60000, // Longer max delay for network operations
    jitter: 0.3,
    operationName: 'Network operation'
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return retryWithBackoff(fn, mergedOptions);
};

export {
  retryWithBackoff,
  retrySupabaseOperation,
  retryNetworkOperation,
  isRetryableError,
  isPermanentError,
  calculateBackoffDelay,
  sleep
};
