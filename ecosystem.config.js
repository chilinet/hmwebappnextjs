module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: './server.js',
      instances: '1',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
} 