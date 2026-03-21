module.exports = {
  apps: [
    {
      name: 'lifelup',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/lifelup',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
