import {
  CHECKIN_V2_METRIC_BY_KEY,
  CHECKIN_V2_METRICS,
  type CheckinV2MetricKey,
} from '../../src/checkins/checkins-v2.catalog';

function tagLabels(metricKey: CheckinV2MetricKey): string[] {
  return CHECKIN_V2_METRIC_BY_KEY[metricKey].tags.map((tag) => tag.label);
}

describe('Check-in v2 tag catalog', () => {
  it('keeps an uncertain tag available for every state metric', () => {
    for (const metric of CHECKIN_V2_METRICS) {
      expect(metric.tags.some((tag) => tag.label.startsWith('непонят'))).toBe(true);
    }
  });

  it('keeps mood expressive without replacing the playful tag', () => {
    expect(tagLabels('mood')).toEqual(expect.arrayContaining(['игривое', 'непонятное']));
  });

  it('keeps energy tags simple and avoids unclear analytical wording', () => {
    const labels = tagLabels('energy');

    expect(labels).toContain('непонятно');
    expect(labels).not.toContain('нервная энергия');
  });

  it('removes metric-scale duplicate wording from calm and clarity tags', () => {
    expect(tagLabels('calm')).toEqual(
      expect.arrayContaining(['есть опора', 'в безопасности', 'на взводе', 'непонятно']),
    );
    expect(tagLabels('calm')).not.toContain('спокойно');
    expect(tagLabels('calm')).not.toContain('хаотично');

    expect(tagLabels('clarity')).toEqual(
      expect.arrayContaining(['легко думать', 'мысли упорядочены', 'туман в голове', 'зацикленность', 'непонятно']),
    );
    expect(tagLabels('clarity')).not.toContain('ясно');
    expect(tagLabels('clarity')).not.toContain('собранно');
    expect(tagLabels('clarity')).not.toContain('туманно');
  });

  it('keeps motivation analytical and adds an uncertain option', () => {
    expect(tagLabels('motivation')).toEqual(
      expect.arrayContaining(['прокрастинация', 'избегание', 'сопротивление', 'непонятно']),
    );
  });

  it('adds clearer general, social, and physical state qualifiers', () => {
    expect(tagLabels('overall_state')).toEqual(
      expect.arrayContaining(['ресурсно', 'на пределе', 'опустошенно', 'непонятно']),
    );
    expect(tagLabels('social')).toEqual(expect.arrayContaining(['хочется поддержки', 'непонятно']));
    expect(tagLabels('physical_state')).toEqual(
      expect.arrayContaining(['слабость', 'скованность', 'непонятно']),
    );
  });
});
