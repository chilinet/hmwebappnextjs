// Central Theme Configuration for HMWebApp
// This file contains all color schemes, styles, and theme configurations

export const theme = {
  // Light Theme Colors
  light: {
    primary: '#007bff',
    secondary: '#6c757d',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8',
    light: '#f8f9fa',
    dark: '#343a40',
    
    // Background colors
    background: '#ffffff',
    backgroundSecondary: '#f8f9fa',
    backgroundTertiary: '#e9ecef',
    
    // Text colors
    textPrimary: '#212529',
    textSecondary: '#6c757d',
    textMuted: '#6c757d',
    textLight: '#ffffff',
    
    // Card colors
    cardBackground: '#ffffff',
    cardBorder: '#dee2e6',
    cardShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',
    
    // Form colors
    inputBackground: '#ffffff',
    inputBorder: '#ced4da',
    inputFocusBorder: '#80bdff',
    inputFocusShadow: '0 0 0 0.2rem rgba(0, 123, 255, 0.25)',
    
    // Button colors
    buttonPrimary: '#007bff',
    buttonPrimaryHover: '#0056b3',
    buttonSecondary: '#6c757d',
    buttonSecondaryHover: '#545b62',
    
    // Alert colors
    alertSuccess: '#d4edda',
    alertSuccessBorder: '#c3e6cb',
    alertSuccessText: '#155724',
    alertDanger: '#f8d7da',
    alertDangerBorder: '#f5c6cb',
    alertDangerText: '#721c24',
    alertWarning: '#fff3cd',
    alertWarningBorder: '#ffeaa7',
    alertWarningText: '#856404',
    alertInfo: '#d1ecf1',
    alertInfoBorder: '#bee5eb',
    alertInfoText: '#0c5460',
  },
  
  // Dark Theme Colors (for dashboard)
  dark: {
    primary: '#007bff',
    secondary: '#6c757d',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8',
    light: '#f8f9fa',
    dark: '#343a40',
    
    // Background colors
    background: '#212529',
    backgroundSecondary: '#343a40',
    backgroundTertiary: '#495057',
    
    // Text colors
    textPrimary: '#ffffff',
    textSecondary: '#adb5bd',
    textMuted: '#6c757d',
    textLight: '#ffffff',
    
    // Card colors
    cardBackground: '#343a40',
    cardBorder: '#495057',
    cardShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.5)',
    
    // Form colors
    inputBackground: '#495057',
    inputBorder: '#6c757d',
    inputFocusBorder: '#80bdff',
    inputFocusShadow: '0 0 0 0.2rem rgba(0, 123, 255, 0.25)',
    
    // Button colors
    buttonPrimary: '#007bff',
    buttonPrimaryHover: '#0056b3',
    buttonSecondary: '#6c757d',
    buttonSecondaryHover: '#545b62',
    
    // Alert colors
    alertSuccess: '#155724',
    alertSuccessBorder: '#28a745',
    alertSuccessText: '#d4edda',
    alertDanger: '#721c24',
    alertDangerBorder: '#dc3545',
    alertDangerText: '#f8d7da',
    alertWarning: '#856404',
    alertWarningBorder: '#ffc107',
    alertWarningText: '#fff3cd',
    alertInfo: '#0c5460',
    alertInfoBorder: '#17a2b8',
    alertInfoText: '#d1ecf1',
  }
};

// CSS Variables for easy use in components
export const cssVariables = {
  light: `
    :root {
      --primary: ${theme.light.primary};
      --secondary: ${theme.light.secondary};
      --success: ${theme.light.success};
      --danger: ${theme.light.danger};
      --warning: ${theme.light.warning};
      --info: ${theme.light.info};
      --light: ${theme.light.light};
      --dark: ${theme.light.dark};
      
      --background: ${theme.light.background};
      --background-secondary: ${theme.light.backgroundSecondary};
      --background-tertiary: ${theme.light.backgroundTertiary};
      
      --text-primary: ${theme.light.textPrimary};
      --text-secondary: ${theme.light.textSecondary};
      --text-muted: ${theme.light.textMuted};
      --text-light: ${theme.light.textLight};
      
      --card-background: ${theme.light.cardBackground};
      --card-border: ${theme.light.cardBorder};
      --card-shadow: ${theme.light.cardShadow};
      
      --input-background: ${theme.light.inputBackground};
      --input-border: ${theme.light.inputBorder};
      --input-focus-border: ${theme.light.inputFocusBorder};
      --input-focus-shadow: ${theme.light.inputFocusShadow};
      
      --button-primary: ${theme.light.buttonPrimary};
      --button-primary-hover: ${theme.light.buttonPrimaryHover};
      --button-secondary: ${theme.light.buttonSecondary};
      --button-secondary-hover: ${theme.light.buttonSecondaryHover};
      
      --alert-success: ${theme.light.alertSuccess};
      --alert-success-border: ${theme.light.alertSuccessBorder};
      --alert-success-text: ${theme.light.alertSuccessText};
      --alert-danger: ${theme.light.alertDanger};
      --alert-danger-border: ${theme.light.alertDangerBorder};
      --alert-danger-text: ${theme.light.alertDangerText};
      --alert-warning: ${theme.light.alertWarning};
      --alert-warning-border: ${theme.light.alertWarningBorder};
      --alert-warning-text: ${theme.light.alertWarningText};
      --alert-info: ${theme.light.alertInfo};
      --alert-info-border: ${theme.light.alertInfoBorder};
      --alert-info-text: ${theme.light.alertInfoText};
    }
  `,
  
  dark: `
    :root {
      --primary: ${theme.dark.primary};
      --secondary: ${theme.dark.secondary};
      --success: ${theme.dark.success};
      --danger: ${theme.dark.danger};
      --warning: ${theme.dark.warning};
      --info: ${theme.dark.info};
      --light: ${theme.dark.light};
      --dark: ${theme.dark.dark};
      
      --background: ${theme.dark.background};
      --background-secondary: ${theme.dark.backgroundSecondary};
      --background-tertiary: ${theme.dark.backgroundTertiary};
      
      --text-primary: ${theme.dark.textPrimary};
      --text-secondary: ${theme.dark.textSecondary};
      --text-muted: ${theme.dark.textMuted};
      --text-light: ${theme.dark.textLight};
      
      --card-background: ${theme.dark.cardBackground};
      --card-border: ${theme.dark.cardBorder};
      --card-shadow: ${theme.dark.cardShadow};
      
      --input-background: ${theme.dark.inputBackground};
      --input-border: ${theme.dark.inputBorder};
      --input-focus-border: ${theme.dark.inputFocusBorder};
      --input-focus-shadow: ${theme.dark.inputFocusShadow};
      
      --button-primary: ${theme.dark.buttonPrimary};
      --button-primary-hover: ${theme.dark.buttonPrimaryHover};
      --button-secondary: ${theme.dark.buttonSecondary};
      --button-secondary-hover: ${theme.dark.buttonSecondaryHover};
      
      --alert-success: ${theme.dark.alertSuccess};
      --alert-success-border: ${theme.dark.alertSuccessBorder};
      --alert-success-text: ${theme.dark.alertSuccessText};
      --alert-danger: ${theme.dark.alertDanger};
      --alert-danger-border: ${theme.dark.alertDangerBorder};
      --alert-danger-text: ${theme.dark.alertDangerText};
      --alert-warning: ${theme.dark.alertWarning};
      --alert-warning-border: ${theme.dark.alertWarningBorder};
      --alert-warning-text: ${theme.dark.alertWarningText};
      --alert-info: ${theme.dark.alertInfo};
      --alert-info-border: ${theme.dark.alertInfoBorder};
      --alert-info-text: ${theme.dark.alertInfoText};
    }
  `
};

// Utility functions
export const getTheme = (themeName = 'light') => {
  return theme[themeName] || theme.light;
};

export const getCssVariables = (themeName = 'light') => {
  return cssVariables[themeName] || cssVariables.light;
};

// Common styles
export const commonStyles = {
  // Card styles
  card: {
    light: {
      backgroundColor: theme.light.cardBackground,
      border: `1px solid ${theme.light.cardBorder}`,
      boxShadow: theme.light.cardShadow,
      borderRadius: '0.375rem',
    },
    dark: {
      backgroundColor: theme.dark.cardBackground,
      border: `1px solid ${theme.dark.cardBorder}`,
      boxShadow: theme.dark.cardShadow,
      borderRadius: '0.375rem',
    }
  },
  
  // Input styles
  input: {
    light: {
      backgroundColor: theme.light.inputBackground,
      border: `1px solid ${theme.light.inputBorder}`,
      color: theme.light.textPrimary,
      borderRadius: '0.375rem',
      padding: '0.375rem 0.75rem',
    },
    dark: {
      backgroundColor: theme.dark.inputBackground,
      border: `1px solid ${theme.dark.inputBorder}`,
      color: theme.dark.textPrimary,
      borderRadius: '0.375rem',
      padding: '0.375rem 0.75rem',
    }
  },
  
  // Button styles
  button: {
    primary: {
      backgroundColor: theme.light.buttonPrimary,
      borderColor: theme.light.buttonPrimary,
      color: theme.light.textLight,
      borderRadius: '0.375rem',
      padding: '0.375rem 0.75rem',
      border: '1px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
    },
    secondary: {
      backgroundColor: theme.light.buttonSecondary,
      borderColor: theme.light.buttonSecondary,
      color: theme.light.textLight,
      borderRadius: '0.375rem',
      padding: '0.375rem 0.75rem',
      border: '1px solid transparent',
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
    }
  }
}; 