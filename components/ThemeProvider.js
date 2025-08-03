import { createContext, useContext, useState } from 'react';
import { getTheme, getCssVariables } from '@/styles/theme';

const ThemeContext = createContext();

export function ThemeProvider({ children, initialTheme = 'light' }) {
  const [currentTheme, setCurrentTheme] = useState(initialTheme);

  const theme = getTheme(currentTheme);
  const cssVariables = getCssVariables(currentTheme);

  const toggleTheme = () => {
    setCurrentTheme(currentTheme === 'light' ? 'dark' : 'light');
  };

  const setTheme = (themeName) => {
    setCurrentTheme(themeName);
  };

  const value = {
    theme,
    currentTheme,
    toggleTheme,
    setTheme,
    cssVariables
  };

  return (
    <ThemeContext.Provider value={value}>
      <style jsx global>{`
        ${cssVariables}
      `}</style>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Theme-aware components
export function ThemedCard({ children, className = '', ...props }) {
  const { currentTheme } = useTheme();
  
  return (
    <div 
      className={`${currentTheme}-theme card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function ThemedButton({ 
  children, 
  variant = 'primary', 
  className = '', 
  ...props 
}) {
  const { currentTheme } = useTheme();
  
  return (
    <button 
      className={`${currentTheme}-theme btn btn-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ThemedInput({ 
  className = '', 
  ...props 
}) {
  const { currentTheme } = useTheme();
  
  return (
    <input 
      className={`${currentTheme}-theme form-control ${className}`}
      {...props}
    />
  );
}

export function ThemedAlert({ 
  children, 
  variant = 'info', 
  className = '', 
  ...props 
}) {
  const { currentTheme } = useTheme();
  
  return (
    <div 
      className={`${currentTheme}-theme alert alert-${variant} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
} 