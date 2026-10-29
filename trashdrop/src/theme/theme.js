/**
 * Material-UI theme configuration for the TrashDrops application.
 * This file defines the color palette, typography, and component styles.
 */

export const themeOptions = {
  palette: {
    mode: 'light', // Default mode, will be overridden by the theme context
    // The design system (src/theme/tokens.css): the dark green for actions,
    // ink and sage text, the pale page
    primary: {
      main: '#1b6e35',
      light: '#e6f2e9',
      dark: '#155a2b',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#b4530e', // orange as text on light surfaces
      light: '#f98b38',
      dark: '#8a3f0b',
      contrastText: '#ffffff',
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
    },
    background: {
      default: '#f6f8f4',
      paper: '#ffffff',
    },
    text: {
      primary: '#0a0f0a',
      secondary: '#525c52',
      disabled: '#6b7280',
    },
  },
  typography: {
    fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none', // Disable uppercase transformation for buttons
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1)',
        },
      },
    },
  },
  // Custom theme variables
  custom: {
    maxWidth: 1200,
    headerHeight: 64,
    drawerWidth: 280,
    footerHeight: 56,
    // Add any other custom theme variables here
  },
};

// Dark theme overrides
export const darkThemeOverrides = {
  palette: {
    mode: 'dark',
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.87)',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
  },
};

// Function to create a theme based on the current mode
export const createCustomTheme = (mode = 'light') => {
  const isDark = mode === 'dark';
  const baseTheme = {
    ...themeOptions,
    palette: {
      ...themeOptions.palette,
      mode,
      ...(isDark ? darkThemeOverrides.palette : {}),
    },
  };

  return baseTheme;
};

export default themeOptions;
