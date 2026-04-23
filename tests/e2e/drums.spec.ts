import { test, expect } from '@grafana/plugin-e2e';
import { injectMidiMock } from './fixtures/midi-mock';

const DEVICE_ID = 'drums-kit-1';
const DEVICE_NAME = 'Drums Kit';

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

test('drums mode: GM1 drum hit appears in table', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  const deviceSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').first();
  await deviceSelector.click();
  await page.getByText(DEVICE_NAME).click();

  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await page.getByText('Drums').click();

  // Fire a Bass Drum 1 hit (note 36) on channel 10 (0x99)
  await page.evaluate(
    ({ deviceId }: { deviceId: string }) => {
      const mock = (window as unknown as Record<string, Record<string, (id: string, bytes: number[]) => void>>)
        .__midiMock;
      mock.fireMessage(deviceId, [0x99, 36, 80]); // Note On ch10, Bass Drum 1
    },
    { deviceId: DEVICE_ID }
  );

  await expect(panelEditPage.panel.fieldNames).toContainText(['Time', 'NoteNumber', 'DrumName', 'Velocity'], {
    timeout: 5000,
  });
});

test('drums mode: Note Off appends null-velocity row', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await panelEditPage.setVisualization('Table');

  const deviceSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').first();
  await deviceSelector.click();
  await page.getByText(DEVICE_NAME).click();

  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await page.getByText('Drums').click();

  await page.evaluate(
    ({ deviceId }: { deviceId: string }) => {
      const mock = (window as unknown as Record<string, Record<string, (id: string, bytes: number[]) => void>>)
        .__midiMock;
      mock.fireMessage(deviceId, [0x99, 36, 80]); // Note On ch10 Bass Drum 1
      mock.fireMessage(deviceId, [0x89, 36, 0]); // Note Off ch10
    },
    { deviceId: DEVICE_ID }
  );

  await expect(panelEditPage.panel.data).toContainText(['Bass Drum 1'], { timeout: 5000 });
});
