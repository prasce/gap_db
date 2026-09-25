import {
    Anchor,
    Button,
    Divider,
    Group,
    Paper,
    PaperProps,
    PasswordInput,
    Stack,
    Text,
    TextInput,
  } from '@mantine/core';
  import { useForm } from '@mantine/form';
  import { isTauri } from '@tauri-apps/api/core';
  import { exit } from '@tauri-apps/plugin-process';
  import { useNavigate } from 'react-router-dom';
  import classes from './LoginPage.module.css';

  interface AuthenticationFormProps extends PaperProps {
    onSubmit?: (values: { email: string; password: string }) => void;
  }

  // 關閉應用程式（瀏覽器模式下只能嘗試關閉分頁）
  function exitApp() {
    if (isTauri()) {
      exit(0);
    } else {
      window.close();
    }
  }

  export function AuthenticationForm(props: AuthenticationFormProps) {
    const { onSubmit, ...paperProps } = props;
    const navigate = useNavigate();
    const form = useForm({
      initialValues: {
        email: 'admin@example.com',
        password: '123456',
      },

      validate: {
        email: (val) => (/^\S+@\S+$/.test(val) ? null : 'Invalid email'),
        password: (val) => (val.length < 6 ? 'Password should include at least 6 characters' : null),
      },
    });

    const handleSubmit = (values: typeof form.values) => {
      if (onSubmit) {
        onSubmit(values);
      }
    };

    return (
      <Paper radius="md" p="lg" withBorder {...paperProps} className={classes.card}>
        <Text size="lg" fw={500} className={classes.heading}>
          Welcome to Mantine, login with
        </Text>

        <Divider label="Or continue with email" labelPosition="center" my="lg" />

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              required
              label="Email"
              placeholder="hello@mantine.dev"
              value={form.values.email}
              onChange={(event) => form.setFieldValue('email', event.currentTarget.value)}
              error={form.errors.email && 'Invalid email'}
              radius="md"
              classNames={{ label: classes.label }}
            />

            <PasswordInput
              required
              label="Password"
              placeholder="Your password"
              value={form.values.password}
              onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
              error={form.errors.password && 'Password should include at least 6 characters'}
              radius="md"
              classNames={{ label: classes.label }}
            />
          </Stack>

          <Group justify="flex-end" mt="xl">
            <Button variant="outline" color="gapBlue" radius="xl" w={100} onClick={exitApp}>
              Exit
            </Button>
            <Button type="submit" color="gapBlue" radius="xl" w={100}>
              Login
            </Button>
          </Group>

          <Group justify="center" mt="md">
            <Anchor
              component="button"
              type="button"
              size="sm"
              className={classes.link}
              onClick={() => navigate('/forgot-password')}
            >
              忘記密碼？
            </Anchor>
          </Group>
        </form>
      </Paper>
    );
  }
