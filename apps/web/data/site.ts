export const CREATE_VISTA_APP_COMMAND = 'npx create-vista-app@latest';

export const siteConfig = {
  name: 'Vista',
  description: 'The React Framework for Visionaries',
  cli: {
    bootstrapCommand: CREATE_VISTA_APP_COMMAND,
  },
  links: {
    github: 'https://github.com/vistakit/Vista-Js',
    docs: '/docs',
  },
  nav: [{ title: 'Docs', href: '/docs' }],
  footer: {
    copyright: 'Vista Framework. All rights reserved.',
  },
};
