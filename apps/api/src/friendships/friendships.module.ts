import { Module } from '@nestjs/common';
import { FriendshipsController } from './friendships.controller.js';
import { FriendshipsService } from './friendships.service.js';

@Module({
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
})
export class FriendshipsModule {}
