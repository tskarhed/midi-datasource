import { test, expect } from '@grafana/plugin-e2e';
import { injectMidiMock } from './fixtures/midi-mock';

const DEVICE_ID = 'test-piano-1';
const DEVICE_NAME = 'Test Piano';

test.beforeEach(async ({ page }) => {
  await injectMidiMock(page);
  await page.addInitScript(
    ({ id, name }: { id: string; name: string }) => {
      // Add a virtual device after mock is installed
      window.addEventListener('load', () => {
        const mock = (window as unknown as Record<string, Record<string, (id: string, name: string) => void>>)
          .__midiMock;
        if (mock) {
          mock.addInput(id, name);
        }
      });
    },
    { id: DEVICE_ID, name: DEVICE_NAME }
  );
});

test('raw mode: row appears after MIDI message', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  // Select the device in the dropdown
  const deviceSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').first();
  await deviceSelector.click();
  await page.getByText(DEVICE_NAME).click();

  // Select Raw mode
  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await page.getByText('Raw messages').click();

  // Fire a Note On event
  await page.evaluate(
    ({ deviceId, bytes }: { deviceId: string; bytes: number[] }) => {
      const mock = (window as unknown as Record<string, Record<string, (id: string, bytes: number[]) => void>>)
        .__midiMock;
      mock.fireMessage(deviceId, bytes);
    },
    { deviceId: DEVICE_ID, bytes: [0x90, 60, 100] }
  );

  // Wait for the row to appear
  await expect(panelEditPage.panel.fieldNames).toContainText(['Timestamp', 'Type'], { timeout: 5000 });
});
