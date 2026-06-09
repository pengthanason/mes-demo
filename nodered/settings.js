module.exports = {
    uiPort: process.env.PORT || 1880,
    httpAdminRoot: '/nr',
    httpNodeRoot: '/nr/api',
    userDir: __dirname,
    flowFile: 'flows.json',
    credentialSecret: process.env.NR_CREDENTIAL_SECRET || 'syntech-intern-dev',
    logging: {
        console: { level: 'info', metrics: false, audit: false }
    },
    editorTheme: {
        header: { title: 'Syntech Intern — Node-RED' },
        tours: false
    },
    functionExternalModules: true,
    functionGlobalContext: {
        MES_API: process.env.MES_API_URL || 'http://172.16.10.87:5100',
        JIG_API: process.env.JIG_API_URL || 'http://172.16.10.87:3000',
    }
}
