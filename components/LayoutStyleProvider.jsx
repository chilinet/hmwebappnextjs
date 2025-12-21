import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export default function LayoutStyleProvider({ children }) {
  const { data: session } = useSession();
  const [stylesLoaded, setStylesLoaded] = useState(false);

  useEffect(() => {
    if (session?.user?.customerid && session?.token) {
      loadAndApplyStyles();
    } else {
      setStylesLoaded(true);
    }
  }, [session]);

  const loadAndApplyStyles = async () => {
    try {
      const response = await fetch(`/api/config/customers/${session.user.customerid}/layout`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          applyStyles(result.data);
          // Force re-render to apply styles
          setTimeout(() => {
            setStylesLoaded(true);
          }, 100);
        } else {
          setStylesLoaded(true);
        }
      } else {
        setStylesLoaded(true);
      }
    } catch (error) {
      console.error('Error loading layout styles:', error);
      // Continue without custom styles
      setStylesLoaded(true);
    }
  };

  const applyStyles = (styles) => {
    const root = document.documentElement;
    
    // Apply colors
    if (styles.colors) {
      root.style.setProperty('--bs-primary', styles.colors.primary);
      root.style.setProperty('--bs-secondary', styles.colors.secondary);
      root.style.setProperty('--custom-bg-color', styles.colors.background);
      root.style.setProperty('--custom-text-color', styles.colors.text);
      root.style.setProperty('--custom-header-bg', styles.colors.headerBackground);
      root.style.setProperty('--custom-card-bg', styles.colors.cardBackground);
      root.style.setProperty('--custom-border-color', styles.colors.borderColor);
    }

    // Apply typography
    if (styles.typography) {
      root.style.setProperty('--custom-font-family', styles.typography.fontFamily);
      root.style.setProperty('--custom-font-size', styles.typography.fontSize);
      root.style.setProperty('--custom-heading-size', styles.typography.headingSize);
      root.style.setProperty('--custom-line-height', styles.typography.lineHeight);
    }

    // Apply spacing
    if (styles.spacing) {
      root.style.setProperty('--custom-padding', styles.spacing.padding);
      root.style.setProperty('--custom-margin', styles.spacing.margin);
      root.style.setProperty('--custom-border-radius', styles.spacing.borderRadius);
    }

    // Apply tiles (klickbare Kacheln)
    if (styles.tiles) {
      root.style.setProperty('--custom-tile-bg', styles.tiles.backgroundColor);
      root.style.setProperty('--custom-tile-hover-bg', styles.tiles.hoverBackgroundColor);
      root.style.setProperty('--custom-tile-icon-color', styles.tiles.iconColor);
      root.style.setProperty('--custom-tile-text-color', styles.tiles.textColor);
      root.style.setProperty('--custom-tile-border-radius', styles.tiles.borderRadius);
    }

    // Apply cards (normale Karten)
    if (styles.cards) {
      root.style.setProperty('--custom-card-bg', styles.cards.backgroundColor);
      root.style.setProperty('--custom-card-border-color', styles.cards.borderColor);
      root.style.setProperty('--custom-card-text-color', styles.cards.textColor);
      root.style.setProperty('--custom-card-border-radius', styles.cards.borderRadius);
      root.style.setProperty('--custom-card-box-shadow', styles.cards.boxShadow);
    }

    // Apply logo
    if (styles.logo && styles.logo.url) {
      // Store logo info for use in Navigation component
      root.style.setProperty('--custom-logo-url', `url(${styles.logo.url})`);
      root.style.setProperty('--custom-logo-width', styles.logo.width);
      root.style.setProperty('--custom-logo-height', styles.logo.height);
    }
  };

  // Apply CSS variables to body and common elements
  useEffect(() => {
    if (stylesLoaded) {
      const style = document.createElement('style');
      style.id = 'custom-layout-styles';
      style.textContent = `
        body {
          background-color: var(--custom-bg-color, #fff3e0) !important;
          color: var(--custom-text-color, #212529) !important;
          font-family: var(--custom-font-family, system-ui, -apple-system, sans-serif) !important;
          font-size: var(--custom-font-size, 16px) !important;
          line-height: var(--custom-line-height, 1.5) !important;
        }
        
        h1, h2, h3, h4, h5, h6 {
          font-size: var(--custom-heading-size, 2rem) !important;
        }
        
        .card:not([class*="cardOrange"]):not([class*="cardGray"]) {
          background-color: var(--custom-card-bg, #ffffff) !important;
          border-color: var(--custom-card-border-color, #dee2e6) !important;
          border-radius: var(--custom-card-border-radius, 0.375rem) !important;
          color: var(--custom-card-text-color, #212529) !important;
          box-shadow: var(--custom-card-box-shadow, 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)) !important;
        }
        
        /* Klickbare Kacheln - CSS Module Klassen mit Attribut-Selektor */
        [class*="cardOrange"],
        [class*="cardGray"] {
          background-color: var(--custom-tile-bg, #fd7e14) !important;
          border: none !important;
          border-radius: var(--custom-tile-border-radius, 0.375rem) !important;
          color: var(--custom-tile-text-color, #ffffff) !important;
          transition: background-color 0.3s !important;
        }
        
        [class*="cardOrange"]:hover,
        [class*="cardGray"]:hover {
          background-color: var(--custom-tile-hover-bg, #e66a00) !important;
        }
        
        [class*="cardOrange"] [class*="iconOrange"],
        [class*="cardGray"] [class*="iconGray"] {
          color: var(--custom-tile-icon-color, #800020) !important;
        }
        
        [class*="cardOrange"] [class*="titleOrange"],
        [class*="cardGray"] [class*="titleGray"],
        [class*="cardOrange"] h5,
        [class*="cardGray"] h5 {
          color: var(--custom-tile-text-color, #ffffff) !important;
        }
        
        [class*="cardOrange"] [class*="textOrange"],
        [class*="cardGray"] [class*="textGray"],
        [class*="cardOrange"] p,
        [class*="cardGray"] p {
          color: var(--custom-tile-text-color, #ffffff) !important;
        }
        
        .navbar {
          background-color: var(--custom-header-bg, #f8f9fa) !important;
        }
        
        .btn-primary {
          background-color: var(--bs-primary, #0d6efd) !important;
          border-color: var(--bs-primary, #0d6efd) !important;
        }
        
        .btn-secondary {
          background-color: var(--bs-secondary, #6c757d) !important;
          border-color: var(--bs-secondary, #6c757d) !important;
        }
      `;
      
      // Remove existing style if present
      const existingStyle = document.getElementById('custom-layout-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
      
      document.head.appendChild(style);
    }
  }, [stylesLoaded]);

  return <>{children}</>;
}

