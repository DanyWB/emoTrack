import {
  formatErrorLogEvent,
  formatLogEvent,
  toLogErrorDetails,
} from '../../src/common/utils/logging.utils';

describe('logging utils', () => {
  it('formats stable key-value log events for simple searchable fields', () => {
    expect(formatLogEvent('telegram_route_failed', {
      routeKey: 'checkin',
      userId: 'user-1',
      fsmState: 'checkin_mood',
      skipped: undefined,
    })).toBe('event=telegram_route_failed routeKey=checkin userId=user-1 fsmState=checkin_mood');
  });

  it('quotes complex values without losing the event key', () => {
    expect(formatLogEvent('readiness_database_check_failed', {
      errorMessage: 'connection refused',
      status: 503,
      retryable: false,
    })).toBe(
      'event=readiness_database_check_failed errorMessage="connection refused" status=503 retryable=false',
    );
  });

  it('adds normalized error details to error events', () => {
    const error = Object.assign(new Error('duplicate key'), { code: 'P2002' });

    expect(formatErrorLogEvent('summary_persist_failed', error, {
      userId: 'user-1',
      periodType: 'd7',
    })).toBe(
      'event=summary_persist_failed userId=user-1 periodType=d7 errorName=Error errorCode=P2002 errorMessage="duplicate key"',
    );
  });

  it('handles non-Error thrown values deterministically', () => {
    expect(toLogErrorDetails('boom')).toEqual({
      name: 'string',
      message: 'boom',
    });
  });
});
