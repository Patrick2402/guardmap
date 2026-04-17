/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Get Started',
      collapsed: false,
      items: ['introduction', 'quickstart', 'how-it-works'],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/connect-cluster',
        'guides/understanding-score',
        'guides/dashboard-tour',
        'guides/multi-cluster',
      ],
    },
    {
      type: 'category',
      label: 'Security Checks',
      collapsed: false,
      items: [
        'checks/overview',
        'checks/pod-security',
        'checks/rbac',
        'checks/network',
        'checks/iam',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: false,
      items: [
        'reference/agent',
        'reference/scoring',
        'reference/api',
      ],
    },
  ],
}

module.exports = sidebars
