import { startServer } from './api';

// Start the server
startServer().catch(error => {
  console.error('Application failed to start:', error);
  process.exit(1);
});
