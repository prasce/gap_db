import { IconArrowLeft } from '@tabler/icons-react';
import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import classes from './ForgotPassword.module.css';

export function ForgotPassword() {
  const navigate = useNavigate();
  
  const form = useForm({
    initialValues: {
      email: 'admin@example.com',
    },
    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
    },
  });

  const handleResetPassword = (values: { email: string }) => {
    // 簡單的重設密碼邏輯
    if (values.email === 'admin@example.com') {
      notifications.show({
        title: '密碼重設成功',
        message: '新密碼已發送到您的信箱：123456',
        color: 'green'
      });
      
      // 延遲一下再返回登入頁面
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } else {
      notifications.show({
        title: '重設失敗',
        message: '此信箱不存在',
        color: 'red'
      });
    }
  };

  return (
    <Container size={460} my={30}>
      <Title className={classes.title} ta="center">
        忘記密碼？
      </Title>
      <Text c="dimmed" fz="sm" ta="center">
        輸入您的信箱以重設密碼
      </Text>

      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <form onSubmit={form.onSubmit(handleResetPassword)}>
          <TextInput 
            label="您的信箱" 
            placeholder="me@mantine.dev" 
            required 
            value={form.values.email}
            onChange={(event) => form.setFieldValue('email', event.currentTarget.value)}
            error={form.errors.email && 'Invalid email'}
          />
          <Group justify="space-between" mt="lg" className={classes.controls}>
            <Anchor 
              c="dimmed" 
              size="sm" 
              className={classes.control}
              onClick={() => navigate('/')}
            >
              <Center inline>
                <IconArrowLeft size={12} stroke={1.5} />
                <Box ml={5}>返回登入頁面</Box>
              </Center>
            </Anchor>
            <Button type="submit" className={classes.control}>重設密碼</Button>
          </Group>
        </form>
      </Paper>
    </Container>
  );
}