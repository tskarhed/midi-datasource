import { test, expect } from '@grafana/plugin-e2e';
import { injectMidiMock } from './fixtures/midi-mock';

const DEVICE_ID = 'notes-piano-1';
const DEVICE_NAME = 'Notes Piano';

test.beforeEach(async ({ page }) => {
  await injectMidiMock(page);
  await page.addInitScript(
    ({ id, name }: { id: string; name: string }) => {
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

test('notes mode: Note On adds row with NoteName C4', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  const deviceSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').first();
  await deviceSelector.click();
  await page.getByText(DEVICE_NAME).click();

  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await page.getByText('Notes').click();

  await page.evaluate(
    ({ deviceId, bytes }: { deviceId: string; bytes: number[] }) => {
      const mock = (window as unknown as Record<string, Record<string, (id: string, bytes: number[]) => void>>)
        .__midiMock;
      mock.fireMessage(deviceId, bytes);
    },
    { deviceId: DEVICE_ID, bytes: [0x90, 60, 100] } // Note On C4
  );

  await expect(panelEditPage.panel.data).toContainText(['C4'], { timeout: 5000 });
});

test('notes mode: Note Off appends null-velocity row', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  const deviceSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').first();
  await deviceSelector.click();
  await page.getByText(DEVICE_NAME).click();

  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await page.getByText('Notes').click();

  await page.evaluate(
    ({ deviceId }: { deviceId: string }) => {
      const mock = (window as unknown as Record<string, Record<string, (id: string, bytes: number[]) => void>>)
        .__midiMock;
      mock.fireMessage(deviceId, [0x90, 60, 100]); // Note On
      mock.fireMessage(deviceId, [0x80, 60, 0]); // Note Off
    },
    { deviceId: DEVICE_ID }
  );

  // After Note Off, panel should contain both the on-row and the null-velocity off-row
  await expect(panelEditPage.panel.fieldNames).toContainText(['Time', 'NoteNumber', 'NoteName', 'Velocity'], {
    timeout: 5000,
  });
});
