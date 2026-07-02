import { expect, type Page, test } from '@playwright/test'

const user = {
  id: 'user-1',
  permissions: [
    'qa:use',
    'report:read',
    'report:write',
    'knowledge:read',
    'knowledge:write',
    'document:upload',
    'system:admin',
    'admin:model-profile:write',
    'admin:parser-config:write',
  ],
  roles: ['system:admin'],
  username: 'operator',
}

async function mockGateway(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    throw new Error(
      `Unexpected Gateway request in critical flow E2E: ${request.method()} ${url.pathname}${url.search}`,
    )
  })

  await page.route('**/api/v1/sessions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          session: {
            accessToken: 'e2e-token',
            createdAt: '2026-06-30T00:00:00Z',
            expiresAt: '2026-07-01T00:00:00Z',
            id: 'session-1',
            userId: user.id,
          },
          user,
        },
        requestId: 'req-session',
      },
    })
  })

  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { data: user, requestId: 'req-me' },
    })
  })

  await page.route('**/api/v1/knowledge-bases*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: [{ id: 'kb-1', name: '运行规程库', status: 'active' }],
          page: { page: 1, pageSize: 20, total: 1 },
          requestId: 'req-kb',
        },
      })
      return
    }
    await route.fallback()
  })

  await page.route('**/api/v1/knowledge-bases/kb-1', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: { id: 'kb-1', name: '运行规程库', status: 'active' },
        requestId: 'req-kb-detail',
      },
    })
  })

  await page.route('**/api/v1/knowledge-bases/kb-1/documents*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            contentType: 'text/plain',
            createdAt: '2026-06-30T00:00:00Z',
            id: 'doc-1',
            knowledgeBaseId: 'kb-1',
            name: 'guide.txt',
            sizeBytes: 12,
            status: 'uploaded',
            tags: ['smoke'],
          },
          requestId: 'req-upload',
        },
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [],
        page: { page: 1, pageSize: 20, total: 0 },
        requestId: 'req-docs',
      },
    })
  })

  await page.route('**/api/v1/qa-sessions/*/attachments**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        json: { data: [], page: { page: 1, pageSize: 20, total: 0 }, requestId: 'req-att' },
        status: 200,
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      json: {
        error: { code: 'not_implemented', message: 'not implemented', requestId: 'req-att' },
      },
      status: 501,
    })
  })

  await page.route('**/api/v1/qa-sessions*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            createdAt: '2026-06-30T00:00:00Z',
            id: 'qa-session-1',
            messageCount: 0,
            status: 'active',
            title: '巡检',
            updatedAt: '2026-06-30T00:00:00Z',
          },
          requestId: 'req-qa-session',
        },
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [],
        page: { page: 1, pageSize: 20, total: 0 },
        requestId: 'req-qa-sessions',
      },
    })
  })

  await page.route('**/api/v1/qa-sessions/*/messages', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        body: [
          'event: message.created',
          'data: {"seq":1,"messageId":"assistant-1","responseRunId":"run-1"}',
          '',
          'event: answer.delta',
          'data: {"seq":2,"content":"请检查油温和负荷趋势。"}',
          '',
          'event: answer.completed',
          'data: {"seq":3,"responseRunId":"run-1"}',
          '',
        ].join('\n'),
        contentType: 'text/event-stream',
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [],
        page: { page: 1, pageSize: 20, total: 0 },
        requestId: 'req-messages',
      },
    })
  })

  await page.route('**/api/v1/report-types', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            code: 'summer_peak_inspection',
            defaultTemplateId: 'tpl-1',
            enabled: true,
            name: '迎峰度夏检查报告',
          },
        ],
        requestId: 'req-report-types',
      },
    })
  })

  await page.route('**/api/v1/report-templates*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            createdAt: '2026-06-30T00:00:00Z',
            enabled: true,
            id: 'tpl-1',
            reportType: 'summer_peak_inspection',
            templateName: '默认模板',
            version: 1,
          },
        ],
        page: { page: 1, pageSize: 20, total: 1 },
        requestId: 'req-templates',
      },
    })
  })

  await page.route('**/api/v1/report-materials*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            category: '运行资料',
            createdAt: '2026-06-30T00:00:00Z',
            enabled: true,
            id: 'mat-1',
            materialName: '设备台账',
            materialType: 'plant_report',
          },
        ],
        page: { page: 1, pageSize: 20, total: 1 },
        requestId: 'req-materials',
      },
    })
  })

  await page.route('**/api/v1/reports', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            createdAt: '2026-06-30T00:00:00Z',
            id: 'report-1',
            name: '2026迎峰度夏检查报告',
            reportType: 'summer_peak_inspection',
            status: 'draft',
            templateId: 'tpl-1',
          },
          requestId: 'req-report',
        },
      })
      return
    }
    await route.fallback()
  })

  await page.route('**/api/v1/reports/report-1/jobs', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          createdAt: '2026-06-30T00:00:00Z',
          id: 'job-1',
          jobType: 'outline_generation',
          progress: { completedSections: 1, percent: 50, totalSections: 2 },
          reportId: 'report-1',
          status: 'running',
        },
        requestId: 'req-job',
      },
    })
  })

  await page.route('**/api/v1/reports/report-1/outlines', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            createdAt: '2026-06-30T00:00:00Z',
            id: 'outline-1',
            reportId: 'report-1',
            sections: [
              { id: 'section-1', level: 1, order: 1, title: 'Equipment overview' },
              { id: 'section-2', level: 1, order: 2, title: 'Risks and actions' },
            ],
            status: 'draft',
            updatedAt: '2026-06-30T00:00:00Z',
          },
        ],
        requestId: 'req-outlines',
      },
    })
  })

  await page.route('**/api/v1/reports/report-1/sections', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          {
            content: 'Equipment load is stable. Watch oil temperature trends.',
            id: 'section-1',
            order: 1,
            reportId: 'report-1',
            status: 'draft',
            title: 'Equipment overview',
            updatedAt: '2026-06-30T00:00:00Z',
          },
        ],
        requestId: 'req-sections',
      },
    })
  })

  await page.route('**/api/v1/reports/report-1/events', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [],
        requestId: 'req-report-events',
      },
    })
  })

  await page.route('**/api/v1/report-jobs/job-1', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          createdAt: '2026-06-30T00:00:00Z',
          id: 'job-1',
          jobType: 'outline_generation',
          progress: { completedSections: 1, percent: 50, totalSections: 2 },
          reportId: 'report-1',
          status: 'running',
        },
        requestId: 'req-job-status',
      },
    })
  })
}

async function login(page: Page) {
  await mockGateway(page)
  await page.goto('/login')
  await page.locator('#username').fill('operator')
  await page.locator('#password').fill('secret')
  await page.getByRole('button').first().click()
  await expect(page).toHaveURL(/\/chat$/)
}

test.describe('frontend critical smoke flows', () => {
  test('logs in through the gateway session boundary', async ({ page }) => {
    await login(page)

    await expect(page.locator('body')).toContainText(/智能|鏅鸿兘|报告|鎶ュ憡/)
  })

  test('opens the document upload workflow without a live backend', async ({ page }) => {
    await login(page)
    await page.goto('/admin/knowledge/documents?knowledgeBaseId=kb-1')
    await page.getByRole('button', { name: /上传|涓婁紶/ }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.setInputFiles('input[type="file"]', {
      buffer: Buffer.from('hello world'),
      mimeType: 'text/plain',
      name: 'guide.txt',
    })
    await page
      .getByRole('button', { name: /上传|涓婁紶/ })
      .last()
      .click()
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toBeVisible()
  })

  test('streams a chat answer through mocked gateway SSE', async ({ page }) => {
    await login(page)
    await page.goto('/chat')
    await page.getByRole('textbox').fill('变压器巡检要点')
    await page.getByRole('button', { name: /发送|鍙戦€?/ }).click()

    await expect(page.locator('body')).toContainText('请检查油温和负荷趋势。')
  })

  test('starts report generation and reaches the job progress panel', async ({ page }) => {
    await login(page)
    await page.goto('/reports/generate')
    await page
      .getByRole('button', { name: /创建|鍒涘缓/ })
      .first()
      .click()

    await expect(page.locator('body')).toContainText(/job-1|任务|浠诲姟/)
    await expect(page.locator('body')).toContainText(/50%|进度|杩涘害/)
  })
})
