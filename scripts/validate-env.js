#!/usr/bin/env node

/**
 * Script zur Validierung der Umgebungsvariablen vor dem Start
 * Wird beim Container-Start ausgeführt, um sicherzustellen, dass alle benötigten Variablen gesetzt sind
 */

const requiredEnvVars = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'THINGSBOARD_URL',
  'MSSQL_SERVER',
  'MSSQL_USER',
  'MSSQL_PASSWORD',
  'MSSQL_DATABASE',
];

const optionalEnvVars = [
  'REPORTING_URL',
  'REPORTING_PRESHARED_KEY',
  'MSSQL_PORT',
];

function validateEnvironment() {
  const missing = [];
  const warnings = [];

  console.log('🔍 Validating environment variables...\n');

  // Prüfe erforderliche Variablen
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
      console.error(`❌ Missing required: ${varName}`);
    } else {
      console.log(`✅ Found: ${varName}`);
    }
  });

  // Prüfe optionale Variablen
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      warnings.push(varName);
      console.warn(`⚠️  Missing optional: ${varName}`);
    } else {
      console.log(`✅ Found: ${varName}`);
    }
  });

  console.log('');

  if (missing.length > 0) {
    console.error('❌ Validation failed! Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease set these variables before starting the container.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Warning: Some optional environment variables are missing:');
    warnings.forEach(varName => {
      console.warn(`   - ${varName}`);
    });
    console.warn('\nThe application may not work correctly without these variables.');
  }

  console.log('✅ Environment validation passed!');
  return true;
}

// Nur in Production validieren
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
} else {
  console.log('ℹ️  Skipping validation in development mode');
}

