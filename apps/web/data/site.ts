export const CREATE_VISTA_APP_COMMAND = 'npx create-vista-app@latest';

export const siteConfig = {
  name: 'Vista',
  description: 'The React framework for UI, APIs, auth, and AI — one app directory.',
  cli: {
    bootstrapCommand: CREATE_VISTA_APP_COMMAND,
  },
  links: {
    github: 'https://github.com/Mantitup-Org/vista',
    docs: '/docs',
  },
  nav: [{ title: 'Docs', href: '/docs' }],
  footer: {
    copyright: 'Vista Framework. All rights reserved.',
  },
};
