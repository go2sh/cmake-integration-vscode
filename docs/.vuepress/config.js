module.exports = {
  title: 'CMake Integration',
  description: 'CMake Integration Extension for Visual Studio Code.',
  plugins: ['@vuepress/blog'],
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/start/quickstart' },
      { text: 'Github', link: 'https://github.com/go2sh/cmake-integration-vscode' },
    ],
    sidebar: [
      {
        title: "Introduction",
        path: "/start/installation",
        collapsable: false,
        sidebarDepth: 1,
        children: [
          '/start/installation',
          '/start/quickstart',
          '/start/troubleshooting'
        ]
      },
      {
        title: "Guide",
        path: "/guide/integration",
        collapsable: false,
        sidebarDepth: 1,
        children: [
          '/guide/integration',
          '/guide/source_structure'
        ]
      },
      {
        title: 'Reference',   // required
        path: '/reference/commands',      // optional, which should be a absolute path.
        collapsable: false, // optional, defaults to true
        sidebarDepth: 1,    // optional, defaults to 1
        children: [
          '/reference/commands',
          '/reference/configurations',
          '/reference/settings'
        ]
      }
    ]
  }
}