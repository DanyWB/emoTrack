import { formatCheckinConfirmation } from '../../src/telegram/telegram.copy';

describe('formatCheckinConfirmation', () => {
  it('formats a concise confirmation with combined sleep and extras', () => {
    const text = formatCheckinConfirmation({
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
      updated: true,
      noteAdded: true,
      tagsCount: 2,
      eventAdded: true,
    });

    expect(text).toContain('Готово. Запись за сегодня обновлена.');
    expect(text).toContain('Сон: 7.5 ч, качество 8');
    expect(text).toContain('Дополнительно: заметка, 2 тега, событие');
  });

  it('omits extras when only core scores are present', () => {
    const text = formatCheckinConfirmation({
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      updated: false,
    });

    expect(text).toContain('Готово. Запись за сегодня сохранена.');
    expect(text).not.toContain('Дополнительно:');
  });

  it('renders only the available core metrics in a partial confirmation', () => {
    const text = formatCheckinConfirmation({
      moodScore: 9,
      stressScore: 3,
      updated: false,
    });

    expect(text).toContain('Настроение: 9');
    expect(text).toContain('Стресс: 3');
    expect(text).not.toContain('Энергия:');
    expect(text).not.toContain('Сон:');
  });
});
