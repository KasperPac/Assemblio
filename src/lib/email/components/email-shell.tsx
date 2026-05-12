import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
} from "@react-email/components";
import { COLOR, FONT, SIZE } from "./tokens";

export interface EmailShellProps {
  logoBaseUrl: string;
  children: React.ReactNode;
}

export function EmailShell({ logoBaseUrl, children }: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Body
        style={{
          background: COLOR.bgPage,
          fontFamily: FONT.body,
          color: COLOR.inkStrong,
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            maxWidth: SIZE.cardMaxWidthPx,
            margin: "0 auto",
          }}
        >
          <Section
            style={{
              background: COLOR.bgCard,
              border: `1px solid ${COLOR.stroke}`,
              borderRadius: SIZE.cardRadiusPx,
              padding: SIZE.cardPaddingPx,
            }}
          >
            <Img
              src={`${logoBaseUrl}/Manuva_svg.svg`}
              alt="Manuva"
              width={SIZE.logoWidthPx}
              style={{
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
                marginBottom: 24,
              }}
            />
            {children}
          </Section>
          <Section style={{ padding: "20px 4px 0" }}>
            <Text
              style={{
                fontSize: 12,
                color: COLOR.inkFaint,
                margin: "0 0 4px",
              }}
            >
              Manuva · manuva.app
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: COLOR.inkFaint,
                margin: 0,
              }}
            >
              If you weren&apos;t expecting this, you can safely ignore this
              email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
