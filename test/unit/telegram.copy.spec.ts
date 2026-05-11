import {
  escapeHtml,
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

    expect(text).toContain('✅ <b>Запись за сегодня обновлена</b>');
    expect(text).toContain('🌡 Состояние: настроение 8, энергия 7, стресс 3');
    expect(text).toContain('😴 Сон: 7.5 ч, качество 8');
    expect(text).toContain('➕ Добавлено: заметка, 2 тега, событие');
  });

  it('omits extras when only core scores are present', () => {
    const text = formatCheckinConfirmation({
      moodScore: 6,
      energyScore: 5,
      stressScore: 4,
      updated: false,
    });

    expect(text).toContain('✅ <b>Запись за сегодня сохранена</b>');
    expect(text).not.toContain('Добавлено:');
  });

  it('renders only the available core metrics in a partial confirmation', () => {
    const text = formatCheckinConfirmation({
      moodScore: 9,
      stressScore: 3,
      updated: false,
    });

    expect(text).toContain('🌡 Состояние: настроение 9, стресс 3');
    expect(text).not.toContain('энергия');
    expect(text).not.toContain('😴 Сон:');
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

    expect(text).toContain('🧩 Доп. метрики: Радость 8, Самочувствие 6');
  });

  it('escapes dynamic extra metric labels for HTML parse mode', () => {
    const text = formatCheckinConfirmation({
      extraMetricScores: [
        {
          key: 'joy',
          label: 'Joy <fast> & steady',
          value: 8,
        },
      ],
      updated: false,
    });

    expect(text).toContain('Joy &lt;fast&gt; &amp; steady 8');
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

    expect(text).toContain('📅 <b>12.03.2026</b>');
    expect(text).toContain('настроение <b>8</b> · энергия <b>7</b> · стресс <b>3</b>');
    expect(text).toContain('😴 <b>Сон</b>: 7.5 ч · качество 8');
    expect(text).toContain('🧩 <b>Доп. метрики</b>: Радость <b>8</b>, Самочувствие <b>6</b>');
    expect(text).toContain('📝 заметка · 🏷 2 тега · 🗂 2 события');
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

    expect(text).toContain('🧩 <b>Доп. метрики</b>: Радость <b>8</b>');
    expect(text).toContain('🗂 0 событий');
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
    expect(text).toContain('настроение <b>8</b> · энергия <b>7</b> · стресс <b>3</b>');
    expect(text).toContain('<b>😴 Сон</b>\n7.5 ч, качество 8');
    expect(text).toContain('🧩 <b>Доп. метрики</b>: Радость <b>8</b>');
    expect(text).toContain('<b>📝 Заметка</b>\nBusy day');
    expect(text).toContain('<b>🏷 Теги</b>\n• Тревога');
    expect(text).toContain('<b>🗂 События</b>\n• Путешествия: <b>Trip</b> · оценка 7 · 11.03.2026–12.03.2026');
    expect(text).toContain('<i>Two-day trip</i>');
  });

  it('escapes user-provided history details for HTML parse mode', () => {
    const text = formatHistoryEntryDetail({
      entryDate: new Date('2026-03-12T00:00:00.000Z'),
      moodScore: null,
      energyScore: null,
      stressScore: null,
      noteText: '<b>raw note</b>',
      tags: [
        {
          id: 'tag-1',
          label: 'Tag & mood',
        },
      ],
      events: [
        {
          id: 'event-1',
          eventType: 'other',
          title: 'Event <x>',
          description: 'Description & details',
          eventScore: 5,
          eventDate: new Date('2026-03-12T00:00:00.000Z'),
        },
      ],
    });

    expect(text).toContain('&lt;b&gt;raw note&lt;/b&gt;');
    expect(text).toContain('Tag &amp; mood');
    expect(text).toContain('Event &lt;x&gt;');
    expect(text).toContain('Description &amp; details');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML control characters', () => {
    expect(escapeHtml(`A&B <x> "q" 's'`)).toBe('A&amp;B &lt;x&gt; &quot;q&quot; &#39;s&#39;');
  });
});
