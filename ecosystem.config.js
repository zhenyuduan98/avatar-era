module.exports = {
  apps: [{
    name: 'avatar-proxy',
    script: './proxy.js',
    cwd: '/home/azureuser/.openclaw/workspace/Azure-Ai-Avatar',
    env: {
      AZURE_SPEECH_KEY: 'REDACTED_SET_VIA_ENV',
      AZURE_SPEECH_REGION: 'eastus'
    }
  }, {
    name: 'avatar-static',
    script: './server.js',
    cwd: '/home/azureuser/.openclaw/workspace/Azure-Ai-Avatar'
  }]
};
