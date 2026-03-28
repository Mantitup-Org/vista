import { type NodePlopAPI } from 'node-plop';
import * as helpers from './helpers';

interface TestResponse {
  name: string;
  type: 'unit' | 'e2e';
}

interface ErrorResponse {
  name: string;
  title: string;
  summary: string;
  fix: string;
}

function validateNonEmptyString(field: string) {
  return function validate(value: string) {
    if (/.+/.test(value)) {
      return true;
    }
    return `${field} is required`;
  };
}

export default function generator(plop: NodePlopAPI): void {
  helpers.init(plop);

  plop.setGenerator('test', {
    description: 'Create a new Vista test file',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Test name',
        validate: validateNonEmptyString('test name'),
      },
      {
        type: 'list',
        name: 'type',
        message: 'Test type',
        choices: [
          { name: 'unit', value: 'unit' },
          { name: 'e2e', value: 'e2e' },
        ],
      },
    ],
    actions(answers) {
      const { type } = answers as TestResponse;
      const destination =
        type === 'unit'
          ? 'packages/vista/test/stack/{{ toFileName name }}.test.ts'
          : 'packages/vista/test/server/{{ toFileName name }}.test.ts';

      return [
        {
          type: 'add',
          path: destination,
          template: `describe('{{ name }}', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
`,
        },
      ];
    },
  });

  plop.setGenerator('error', {
    description: 'Create a new docs error entry',
    prompts: [
      {
        name: 'name',
        type: 'input',
        message: 'Error key (slug)',
        validate: validateNonEmptyString('name'),
      },
      {
        name: 'title',
        type: 'input',
        message: 'Error title',
        validate: validateNonEmptyString('title'),
      },
      {
        name: 'summary',
        type: 'input',
        message: 'Short summary',
        validate: validateNonEmptyString('summary'),
      },
      {
        name: 'fix',
        type: 'input',
        message: 'How to fix',
        validate: validateNonEmptyString('fix'),
      },
    ],
    actions(_answers) {
      return [
        {
          type: 'add',
          path: 'apps/web/content/docs/reference/errors-{{ toFileName name }}.md',
          template: `---
category: reference
slug: errors-{{ toFileName name }}
title: "{{ title }}"
summary: "{{ summary }}"
order: 999
updatedAt: "2026-03-20"
---

## Why This Happens

{{ summary }}

## How To Fix

- {{ fix }}
`,
        },
      ];
    },
  });
}
