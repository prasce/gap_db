import { Container, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { AuthenticationForm } from './AuthenticationForm';
import classes from './LoginPage.module.css';

export function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (values: { email: string; password: string }) => {
    // 簡單的登入驗證邏輯
    if (values.email === 'admin@example.com' && values.password === '123456') {
      notifications.show({
        title: '登入成功',
        message: '歡迎回來！您離夢想又更近一步了！',
        color: 'blue'
      });
      
      // 跳轉到主應用程式
      navigate('/deals/open/all');
    } else {
      notifications.show({
        title: '登入失敗',
        message: '帳號或密碼錯誤',
        color: 'red'
      });
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center" className={classes.title}>
        歡迎使用桌面應用程式
      </Title>

      <AuthenticationForm onSubmit={handleLogin} shadow="md" p={30} mt={30} />
    </Container>
  );
} 