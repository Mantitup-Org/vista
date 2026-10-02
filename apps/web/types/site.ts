export interface NavItem {
  title: string;
  href: string;
}

export interface SiteConfig {
  name: string;
  description: string;
  cli: {
    bootstrapCommand: string;
  };
  links: {
    github: string;
    docs: string;
  };
  nav: NavItem[];
  footer: {
    copyright: string;
  };
}
