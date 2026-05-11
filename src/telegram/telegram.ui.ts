import type { Context } from 'telegraf';
import type { ExtraEditMessageText, ExtraReplyMessage } from 'telegraf/typings/telegram-types';

export type HtmlMessageExtra = object;
export type TelegramMessageRef = {
  message_id?: number;
};

type MessageDeletionContext = Context & {
  chat?: {
    id?: number | string;
  };
  callbackQuery?: {
    message?: {
      message_id?: number;
      chat?: {
        id?: number | string;
      };
    };
  };
  message?: {
    message_id?: number;
    chat?: {
      id?: number | string;
    };
  };
  deleteMessage?: (messageId?: number) => Promise<unknown>;
  telegram?: {
    deleteMessage?: (chatId: number | string, messageId: number) => Promise<unknown>;
  };
};

function withHtmlReply(extra?: HtmlMessageExtra): ExtraReplyMessage {
  return {
    ...(extra ?? {}),
    parse_mode: 'HTML',
  } as ExtraReplyMessage;
}

function withHtmlEdit(extra?: HtmlMessageExtra): ExtraEditMessageText {
  return {
    ...(extra ?? {}),
    parse_mode: 'HTML',
  } as ExtraEditMessageText;
}

function isMessageNotModifiedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('message is not modified');
}

export async function replyHtml(
  ctx: Context,
  text: string,
  extra?: HtmlMessageExtra,
): Promise<TelegramMessageRef | undefined> {
  return ctx.reply(text, withHtmlReply(extra)) as Promise<TelegramMessageRef | undefined>;
}

export async function editOrReplyHtml(
  ctx: Context,
  text: string,
  extra?: HtmlMessageExtra,
): Promise<TelegramMessageRef | undefined> {
  const editableContext = ctx as Context & {
    editMessageText?: Context['editMessageText'];
  };

  if (typeof editableContext.editMessageText === 'function') {
    try {
      await editableContext.editMessageText(text, withHtmlEdit(extra));
      return getCurrentMessageRef(ctx);
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        return getCurrentMessageRef(ctx);
      }
    }
  }

  return replyHtml(ctx, text, extra);
}

export async function deleteCurrentMessage(ctx: Context): Promise<boolean> {
  const deletableContext = ctx as Context & {
    deleteMessage?: Context['deleteMessage'];
  };

  if (typeof deletableContext.deleteMessage !== 'function') {
    return false;
  }

  try {
    await deletableContext.deleteMessage();
    return true;
  } catch {
    return false;
  }
}

export async function deleteMessageById(ctx: Context, messageId: number): Promise<boolean> {
  const deletableContext = ctx as MessageDeletionContext;
  const chatId = getChatId(deletableContext);

  if (chatId !== undefined && typeof deletableContext.telegram?.deleteMessage === 'function') {
    try {
      await deletableContext.telegram.deleteMessage(chatId, messageId);
      return true;
    } catch {
      return false;
    }
  }

  if (typeof deletableContext.deleteMessage !== 'function') {
    return false;
  }

  try {
    await deletableContext.deleteMessage(messageId);
    return true;
  } catch {
    return false;
  }
}

export function getCurrentMessageRef(ctx: Context): TelegramMessageRef | undefined {
  const messageId = getCurrentMessageId(ctx);
  return typeof messageId === 'number' ? { message_id: messageId } : undefined;
}

function getCurrentMessageId(ctx: Context): number | undefined {
  const messageContext = ctx as MessageDeletionContext;
  return messageContext.callbackQuery?.message?.message_id ?? messageContext.message?.message_id;
}

function getChatId(ctx: MessageDeletionContext): number | string | undefined {
  return ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id ?? ctx.message?.chat?.id;
}
