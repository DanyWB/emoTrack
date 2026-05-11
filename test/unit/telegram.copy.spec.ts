import {
  formatCheckinConfirmation,
  formatHistoryEntries,
  formatHistoryEntryDetail,
} from '../../src/telegram/telegram.copy';

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

  it('renders enabled extra score metrics in the confirmation body', () => {
    const text = formatCheckinConfirmation({
      moodScore: 7,
      extraMetricScores: [
        {
          key: 'joy',
          label: 'Радость',
          value: 8,
        },
        {
          key: 'wellbeing',
          label: 'Самочувствие',
          value: 6,
        },
      ],
      updated: false,
    });

    expect(text).toContain('Радость: 8');
    expect(text).toContain('Самочувствие: 6');
  });
});

describe('formatHistoryEntries', () => {
  it('renders extra metrics compactly without breaking the history layout', () => {
    const text = formatHistoryEntries([
      {
        id: 'entry-1',
        entryDate: new Date('2026-03-12T00:00:00.000Z'),
        moodScore: 8,
        energyScore: 7,
        stressScore: 3,
        sleepHours: 7.5,
        sleepQuality: 8,
        extraMetricScores: [
          {
            key: 'joy',
            label: 'Радость',
            value: 8,
          },
          {
            key: 'wellbeing',
            label: 'Самочувствие',
            value: 6,
          },
        ],
        hasNote: true,
        tagsCount: 2,
        eventsCount: 2,
      },
    ]);

    expect(text).toContain('Настроение / энергия / стресс: 8 / 7 / 3');
    expect(text).toContain('Сон: 7.5 ч, качество 8');
    expect(text).toContain('Доп. метрики: Радость 8, Самочувствие 6');
    expect(text).toContain('Есть заметка · 2 тега · 2 события');
  });

  it('does not render the legacy core placeholder line for an extra-only entry', () => {
    const text = formatHistoryEntries([
      {
        id: 'entry-1',
        entryDate: new Date('2026-03-12T00:00:00.000Z'),
        moodScore: null,
        energyScore: null,
        stressScore: null,
        extraMetricScores: [
          {
            key: 'joy',
            label: 'Радость',
            value: 8,
          },
        ],
        hasNote: false,
        tagsCount: 0,
        eventsCount: 0,
      },
    ]);

    expect(text).toContain('Доп. метрики: Радость 8');
    expect(text).toContain('0 событий');
    expect(text).not.toContain('Настроение / энергия / стресс: — / — / —');
  });
});

describe('formatHistoryEntryDetail', () => {
  it('renders a full detail view with extra metrics, note, tags, and events', () => {
    const text = formatHistoryEntryDetail({
      entryDate: new Date('2026-03-12T00:00:00.000Z'),
      moodScore: 8,
      energyScore: 7,
      stressScore: 3,
      sleepHours: 7.5,
      sleepQuality: 8,
      extraMetricScores: [
        {
          key: 'joy',
          label: 'Радость',
          value: 8,
        },
      ],
      noteText: 'Busy day',
      tags: [
        {
          id: 'tag-1',
          label: 'Тревога',
        },
      ],
      events: [
        {
          id: 'event-1',
          eventType: 'travel',
          title: 'Trip',
          description: 'Two-day trip',
          eventScore: 7,
          eventDate: new Date('2026-03-11T00:00:00.000Z'),
          eventEndDate: new Date('2026-03-12T00:00:00.000Z'),
        },
      ],
    });

    expect(text).toContain('Запись за 12.03.2026');
    expect(text).toContain('Состояние');
    expect(text).toContain('Настроение / энергия / стресс: 8 / 7 / 3');
    expect(text).toContain('Сон\n7.5 ч, качество 8');
    expect(text).toContain('Доп. метрики: Радость 8');
    expect(text).toContain('Заметка\nBusy day');
    expect(text).toContain('Теги\n- Тревога');
    expect(text).toContain('События\n- Путешествия: Trip · оценка 7 · 11.03.2026–12.03.2026');
    expect(text).toContain('Two-day trip');
  });
});
