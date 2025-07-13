# TrashDrop Production Deployment Guide

This document provides information about deploying the TrashDrop mobile app to production environments.

## Environment Configuration

The application uses different environment files for development and production:

- `.env.development` - Used during local development
- `.env.production` - Used for production builds and deployments

### Production Environment Variables

The `.env.production` file contains configuration settings optimized for production deployment:

```
# API and Supabase Settings
REACT_APP_API_URL=https://api.trashdrops.com
REACT_APP_SUPABASE_URL=https://tfdedlqdsajjdjkerkli.supabase.co
REACT_APP_SUPABASE_ANON_KEY=[your-anon-key]

# Feature Flags
REACT_APP_ENABLE_MOCKS=false
REACT_APP_ENABLE_ANALYTICS=true

# And additional configuration...
```

## Building for Production

To create a production build:

```bash
npm run build
```

This command will:
1. Use the `.env.production` file
2. Generate optimized static files in the `build/` directory
3. Apply production-specific optimizations

## Deployment Steps

1. **Update Environment Variables**:
   - Ensure all environment variables in `.env.production` are set correctly
   - Sensitive keys should be managed through CI/CD secrets

2. **Build the Application**:
   ```bash
   npm run build
   ```

3. **Deploy Static Assets**:
   - Upload the contents of the `build/` directory to your hosting provider
   - Alternatively, use the CI/CD pipeline configured in GitHub Actions

4. **Configure Web Server**:
   - Set up proper caching headers for static assets
   - Configure URL rewrites for the SPA routing

## Responsive UI Considerations

The TrashDrop app features a responsive navigation system:

- **Mobile View**: Top navbar with logo and profile dropdown, plus a fixed bottom navigation bar with Dashboard, Scan QR, Request Pickup, and Report Dumping icons
- **Desktop View**: Traditional horizontal navbar with all navigation items

Ensure your production deployment preserves this responsive behavior for optimal user experience across devices.

## Database Migrations

Before deployment, ensure all database migrations have been applied to match the schema requirements of the frontend:

- Pickup frequency options: 'weekly', 'biweekly', 'monthly'
- Preferred pickup time slots: 'morning', 'afternoon', 'evening'
- Waste type categories: 'general', 'recycling', 'organic'

Use the GitHub Actions workflow to apply migrations automatically.

## Security Considerations

1. **Supabase Keys**:
   - Never commit service role keys to version control
   - Use GitHub secrets for CI/CD pipeline

2. **Authentication**:
   - Production uses secure cookie settings
   - JWT token management is handled through Supabase

3. **API Security**:
   - CORS settings restrict API access to approved domains
   - Rate limiting is recommended for production APIs

## Monitoring and Logging

Once deployed, monitor the application using:
- Supabase Dashboard for database and authentication metrics
- Your preferred application monitoring solution
- Error tracking services to catch client-side issues
