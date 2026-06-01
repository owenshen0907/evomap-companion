// pm2 process definition for EvoMap Companion.
//
//   npm i -g pm2                 # once
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup      # optional: relaunch on boot
//
// autorestart:true is what makes the in-app "更新并重启 / update & restart"
// button work: the server exits after pulling new code, and pm2 brings it
// straight back up on the fresh version.
module.exports = {
  apps: [
    {
      name: 'evomap-companion',
      script: 'src/index.js',
      args: 'ui',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000,
      env: {
        // The EvoMap network this companion binds to. Change here (or set
        // EVOMAP_BASE_URL in your shell) to point at a staging deployment.
        EVOMAP_BASE_URL: 'https://evomap.ai',
        // Where node credentials + the fetched asset cache live. Defaults to
        // ~/.evomap-companion when unset.
        // EVOMAP_COMPANION_HOME: '/absolute/path/to/.evomap-companion',
      },
    },
  ],
};
