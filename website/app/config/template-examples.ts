export const TEMPLATE_EXAMPLE = `actions:
  logs:
    cmd: tail -f log/development.log
    type: terminal
    reuse: true               # one pane, reused on every click
  console:
    cmd: bin/rails console
    type: terminal
  routes: bin/rails routes
`;

export const EXTENDS_EXAMPLE = `name: shop
root: ~/Projects/shop
extends: [rails-tools]        # ~/.lpm/templates/rails-tools.yml
services:
  web: bin/rails server
actions:
  logs:
    cmd: tail -f log/test.log # overrides the template's command
`;
