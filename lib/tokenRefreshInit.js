import { startTokenRefreshCron } from './services/tokenRefreshService';

/**
 * Initialize the ThingsBoard token refresh cron job
 * This should be called when the application starts
 */
export function initializeTokenRefresh() {
  console.log('🚀 Initializing ThingsBoard token refresh service...');
  
  try {
    // Start the cron job
    startTokenRefreshCron();
    
    console.log('✅ ThingsBoard token refresh service initialized successfully');
    
    // Graceful shutdown handling
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down token refresh service...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down token refresh service...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize token refresh service:', error);
  }
}

// Auto-start if this file is imported
// Temporarily disabled to avoid conflicts with manual token refresh
// if (typeof window === 'undefined') { // Only run on server-side
//   initializeTokenRefresh();
// } 