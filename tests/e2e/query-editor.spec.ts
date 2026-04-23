import { test, expect } from '@grafana/plugin-e2e';
import { injectMidiMock } from './fixtures/midi-mock';

test.beforeEach(async ({ page }) => {
  await injectMidiMock(page);
});

test('device selector renders with label "MIDI Device"', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await expect(panelEditPage.getQueryEditorRow('A').getByText('MIDI Device')).toBeVisible();
});

test('mode selector renders with exactly 3 options (Raw, Notes, Drums)', async ({
  panelEditPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  const modeSelector = panelEditPage.getQueryEditorRow('A').getByRole('combobox').nth(1);
  await modeSelector.click();
  await expect(page.getByText('Raw messages')).toBeVisible();
  await expect(page.getByText('Notes')).toBeVisible();
  await expect(page.getByText('Drums')).toBeVisible();
  await expect(page.getByText('Timeline')).not.toBeVisible();
  await page.keyboard.press('Escape');
});

test('no-device state shows info alert', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'midi.yml' });
  await panelEditPage.datasource.set(ds.name);
  await expect(
    panelEditPage.getQueryEditorRow('A').getByText('Select a MIDI device above to start receiving data.')
  ).toBeVisible();
});
