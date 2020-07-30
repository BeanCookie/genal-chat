import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entity/user.entity';
import { Group, GroupMap } from '../group/entity/group.entity';
import { GroupMessage } from '../group/entity/groupMessage.entity';
import { UserMap } from '../friend/entity/friend.entity';
import { FriendMessage } from '../friend/entity/friendMessage.entity';

@WebSocketGateway()
export class ChatGateway {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMap)
    private readonly groupUserRepository: Repository<GroupMap>,
    @InjectRepository(GroupMessage)
    private readonly groupMessageRepository: Repository<GroupMessage>,
    @InjectRepository(UserMap)
    private readonly friendRepository: Repository<UserMap>,
    @InjectRepository(FriendMessage)
    private readonly friendMessageRepository: Repository<FriendMessage>,
  ) {}

  @WebSocketServer()
  server: Server;

  // socket连接钩子
  async handleConnection(client: Socket): Promise<string> {
    const userRoom = client.handshake.query.userId;
    const defaultGroup = await this.groupRepository.find({
      groupName: 'public',
    });
    if (!defaultGroup.length) {
      this.groupRepository.save({
        groupId: 'public',
        groupName: 'public',
        userId: 'admin',
        createTime: new Date().valueOf(),
      });
    }
    // 连接默认加入public房间
    client.join('public');
    // 用户独有消息房间 根据userId
    if (userRoom) {
      client.join(userRoom);
    }
    return '连接成功';
  }

  // 创建群组
  @SubscribeMessage('addGroup')
  async addGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Group,
  ): Promise<boolean> {
    try {
      const isHaveGroup = await this.groupRepository.findOne({
        groupName: data.groupName,
      });
      if (isHaveGroup) {
        return this.server.to(data.userId).emit('addGroup', {
          code: 1,
          message: '该群名字已存在',
          data: isHaveGroup,
        });
      }
      data = await this.groupRepository.save(data);
      client.join(data.groupId);
      const group = await this.groupUserRepository.save(data);
      this.server.to(group.groupId).emit('addGroup', {
        code: 0,
        message: `成功创建群${data.groupName}`,
        data: group,
      });
    } catch (e) {
      this.server
        .to(data.userId)
        .emit('addGroup', { code: 2, message: '创建群失败', data: e });
    }
  }

  // 加入群组
  @SubscribeMessage('joinGroup')
  async joinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GroupMap,
  ): Promise<void> {
    try {
      const group = await this.groupRepository.findOne({
        groupId: data.groupId,
      });
      let userGroup = await this.groupUserRepository.findOne({
        groupId: group.groupId,
        userId: data.userId,
      });
      const user = await this.userRepository.findOne({ userId: data.userId });
      if (group) {
        if (!userGroup) {
          data.groupId = group.groupId;
          userGroup = await this.groupUserRepository.save(data);
        }
        client.join(group.groupId);
        const res = { group: group, user: user };
        this.server.to(group.groupId).emit('joinGroup', {
          code: 0,
          message: `${user.username}加入群${group.groupName}`,
          data: res,
        });
      } else {
        this.server
          .to(data.userId)
          .emit('joinGroup', { code: 1, message: '该群不存在', data: '' });
      }
    } catch (e) {
      this.server
        .to(data.userId)
        .emit('joinGroup', { code: 2, message: '进群失败', data: e });
    }
  }

  // 加入群组的socket连接
  @SubscribeMessage('joinGroupSocket')
  async joinGroupSocket(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GroupMap,
  ): Promise<void> {
    try {
      const group = await this.groupRepository.findOne({
        groupId: data.groupId,
      });
      const user = await this.userRepository.findOne({ userId: data.userId });
      if (group) {
        client.join(group.groupId);
        const res = { group: group, user: user };
        this.server.to(group.groupId).emit('joinGroupSocket', {
          code: 0,
          message: `${user.username}加入群${group.groupName}`,
          data: res,
        });
      } else {
        this.server.to(data.userId).emit('joinGroupSocket', {
          code: 1,
          message: '该群不存在',
          data: '',
        });
      }
    } catch (e) {
      this.server
        .to(data.userId)
        .emit('joinGroupSocket', { code: 2, message: '进群失败', data: e });
    }
  }

  // 发送群消息
  @SubscribeMessage('groupMessage')
  async sendGroupMessage(@MessageBody() data: GroupMessage): Promise<boolean> {
    try {
      const isUserInGroup = await this.groupUserRepository.findOne({
        userId: data.userId,
        groupId: data.groupId,
      });
      if (!isUserInGroup) {
        return this.server.to(data.userId).emit('groupMessage', {
          code: 1,
          message: '群消息发送错误',
          data: '',
        });
      }
      if (data.groupId) {
        this.groupMessageRepository.save(data);
        this.server
          .to(data.groupId)
          .emit('groupMessage', { code: 0, message: '', data: data });
      }
    } catch (e) {
      return this.server
        .to(data.userId)
        .emit('groupMessage', { code: 2, message: '群消息发送错误', data: e });
    }
  }

  // 添加好友
  @SubscribeMessage('addFriend')
  async addFriend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMap,
  ): Promise<boolean> {
    if (data.friendId && data.userId) {
      if (data.userId === data.friendId) {
        return this.server.to(data.userId).emit('addFriend', {
          code: 1,
          message: '不能添加自己为好友',
          data: '',
        });
      }
      const isHave1 = await this.friendRepository.find({
        userId: data.userId,
        friendId: data.friendId,
      });
      const isHave2 = await this.friendRepository.find({
        userId: data.friendId,
        friendId: data.userId,
      });
      const roomId =
        data.userId > data.friendId
          ? data.userId + data.friendId
          : data.friendId + data.userId;

      if (isHave1.length || isHave2.length) {
        this.server.emit('addFriend', {
          code: 1,
          message: '已经有该好友',
          data: data,
        });
        return;
      }

      const friend = await this.userRepository.findOne({
        userId: data.friendId,
      });
      const user = await this.userRepository.findOne({ userId: data.userId });
      if (!friend) {
        this.server
          .to(data.userId)
          .emit('addFriend', { code: 1, message: '该好友不存在', data: '' });
        return;
      }

      // 双方都添加好友 并存入数据库
      await this.friendRepository.save(data);
      const friendData = JSON.parse(JSON.stringify(data));
      const friendId = friendData.friendId;
      friendData.friendId = friendData.userId;
      friendData.userId = friendId;
      delete friendData._id;
      await this.friendRepository.save(friendData);
      client.join(roomId);
      this.server.to(data.userId).emit('addFriend', {
        code: 0,
        message: '添加好友成功',
        data: friend,
      });
      this.server.to(data.friendId).emit('addFriend', {
        code: 0,
        message: '你正被一个人添加',
        data: user,
      });
    }
  }

  // 进入私聊房间
  @SubscribeMessage('joinFriendSocket')
  async joinFriend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMap,
  ): Promise<boolean> {
    try {
      if (data.friendId && data.userId) {
        const isUserInFriend = await this.friendRepository.findOne({
          userId: data.userId,
          friendId: data.friendId,
        });
        const roomId =
          data.userId > data.friendId
            ? data.userId + data.friendId
            : data.friendId + data.userId;
        if (isUserInFriend) {
          client.join(roomId);
          this.server.to(data.userId).emit('joinFriendSocket', {
            code: 0,
            message: '进入私聊socket成功',
            data: isUserInFriend,
          });
          this.server.to(data.friendId).emit('joinFriendSocket', {
            code: 0,
            message: '进入私聊socket成功',
            data: isUserInFriend,
          });
          return;
        }
      }
    } catch (e) {
      this.server.to(data.userId).emit('joinFriendSocket', {
        code: 1,
        message: '进入私聊socket失败',
        data: e,
      });
    }
  }

  // 发送私聊消息
  @SubscribeMessage('friendMessage')
  async friendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: FriendMessage,
  ): Promise<void> {
    try {
      if (data.userId && data.friendId) {
        const roomId =
          data.userId > data.friendId
            ? data.userId + data.friendId
            : data.friendId + data.userId;
        client.join(roomId);
        await this.friendMessageRepository.save(data);
        this.server
          .to(roomId)
          .emit('friendMessage', { code: 0, message: '', data });
      }
    } catch (e) {
      this.server
        .to(data.userId)
        .emit('friendMessage', { code: 2, message: '消息发送失败', data });
    }
  }

  @SubscribeMessage('chatData')
  async getAllData(
    @ConnectedSocket() client: Socket,
    @MessageBody() user: User,
  ): Promise<void> {
    try {
      let groupArr: GroupDto[] = [];
      let friendArr: FriendDto[] = [];
      let userArr: FriendDto[] = [];
      const groupMap: GroupMap[] = await this.groupUserRepository.find({
        userId: user.userId,
      });
      const friendMap: UserMap[] = await this.friendRepository.find({
        userId: user.userId,
      });

      const groupPromise = groupMap.map(async item => {
        return await this.groupRepository.findOne({ groupId: item.groupId });
      });
      const groupMessagePromise = groupMap.map(async item => {
        return await this.groupMessageRepository.find({
          groupId: item.groupId,
        });
      });
      const groupUserPromise = groupMap.map(async item => {
        const userMap = await this.groupUserRepository.find({
          groupId: item.groupId,
        });
        for (const item of userMap) {
          const user = await this.userRepository.findOne({
            select: [
              'userId',
              'username',
              'avatar',
              'role',
              'tag',
              'createTime',
            ],
            where: { userId: item.userId },
          });
          userArr.push(user);
        }
      });
      const friendPromise = friendMap.map(async item => {
        return await this.userRepository.findOne({
          select: ['userId', 'username', 'avatar', 'role', 'tag', 'createTime'],
          where: { userId: item.friendId },
        });
      });
      const friendMessagePromise = friendMap.map(async item => {
        const userMessages: FriendMessageDto[] = await this.friendMessageRepository.find(
          { userId: user.userId, friendId: item.friendId },
        );
        const friendMessages: FriendMessageDto[] = await this.friendMessageRepository.find(
          { userId: item.friendId, friendId: user.userId },
        );
        const data = [...userMessages, ...friendMessages];
        // 得到私聊消息后先排个序
        data.sort((a: any, b: any) => {
          return a.time - b.time;
        });
        return data;
      });

      const groups: GroupDto[] = await Promise.all(groupPromise);
      const groupsMessage: Array<GroupMessageDto[]> = await Promise.all(
        groupMessagePromise,
      );
      groups.map((group, index) => {
        if (groupsMessage[index] && groupsMessage[index].length) {
          group.messages = groupsMessage[index];
        }
      });
      groupArr = groups;

      const friends: FriendDto[] = await Promise.all(friendPromise);
      const friendsMessage: Array<FriendMessageDto[]> = await Promise.all(
        friendMessagePromise,
      );
      friends.map((friend, index) => {
        if (friendsMessage[index] && friendsMessage[index].length) {
          friend.messages = friendsMessage[index];
        }
      });
      friendArr = friends;

      await Promise.all(groupUserPromise);
      userArr = userArr.concat(friendArr);

      this.server.to(user.userId).emit('chatData', {
        code: 0,
        message: '获取聊天数据成功',
        data: {
          groupData: groupArr,
          friendData: friendArr,
          userData: userArr,
        },
      });
    } catch (e) {
      this.server.to(user.userId).emit('chatData', {
        code: 1,
        message: '获取聊天数据失败',
        data: {
          groupData: [],
          friendData: [],
          userData: [],
        },
      });
    }
  }
}
