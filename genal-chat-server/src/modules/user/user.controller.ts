import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UserService } from './user.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getUsers(@Query('userId') userId: string) {
    return this.userService.getUser(userId);
  }

  @Post()
  postUsers(@Body('userIds') userIds: string) {
    return this.userService.postUsers(userIds);
  }

  @Post('/regist')
  addUser(@Body() user) {
    user.createTime = parseInt(user.createTime);
    return this.userService.addUser(user);
  }

  @Patch(':userId')
  updateUser(@Param('userId') userId, @Body() user) {
    console.log(userId, user);
    return this.userService.updateUser(userId, user);
  }

  @Delete()
  delUser(@Query() { id }) {
    return this.userService.delUser(id);
  }

  @Post('/login')
  login(@Body() user) {
    return this.userService.login(user);
  }

  @Get('/findByName')
  getUsersByName(@Query('username') username: string) {
    return this.userService.getUsersByName(username);
  }

  @Post('/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  setUserAvatar(@Body() user, @UploadedFile() file) {
    return this.userService.setUserAvatar(user, file);
  }
}
