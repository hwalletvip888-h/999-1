module.exports = {
  apps: [{
    name: 'h-wallet-backend',
    script: 'tsx',
    args: 'src/services/walletBackend.ts',
    cwd: '/root/h-wallet',
    env: {
      OKX_API_KEY: 'b6c3f62f-5f74-45ba-a2fe-f38aa32e9fcf',
      OKX_SECRET_KEY: '804E87424CAEF1483E0968416108DFB3',
      OKX_PASSPHRASE: 'Haitun888.',
      OKX_PROJECT_ID: 'b4f930082da8d75194dcdba2f7105552',
      WALLET_PORT: '3101',
      NODE_ENV: 'production'
    },
    max_memory_restart: '500M',
    autorestart: true,
    watch: false
  }]
};
