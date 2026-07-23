import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service.js';

interface AuthedSocket extends Socket {
  data: { userId: string };
}

/**
 * Realtime movie-thread chat. Clients join a `circle:<id>:movie:<tmdbId>` room
 * and receive `message:new` broadcasts. The client keeps its optimistic-send /
 * rollback pattern; the server is the authority that assigns message_id/sent_at.
 */
@WebSocketGateway({ namespace: 'chat', cors: { origin: true } })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: AuthedSocket): void {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const payload = this.jwt.verify<{ sub: string }>(token ?? '', {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  private room(circleId: string, movieTmdbId: number): string {
    return `circle:${circleId}:movie:${movieTmdbId}`;
  }

  @SubscribeMessage('thread:join')
  onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { circleId: string; movieTmdbId: number },
  ): void {
    void client.join(this.room(body.circleId, body.movieTmdbId));
  }

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { circleId: string; movieTmdbId: number; body: string; tempId?: string },
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const message = await this.chat.send(
      body.circleId,
      body.movieTmdbId,
      userId,
      body.body,
    );
    // Echo to sender with tempId so the client can reconcile its optimistic row.
    client.emit('message:ack', { tempId: body.tempId, message });
    client
      .to(this.room(body.circleId, body.movieTmdbId))
      .emit('message:new', message);
  }
}
