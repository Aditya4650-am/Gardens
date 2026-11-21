export const XOR_KEY = "X6*HB1K&F[,231^JV@YY6R\"XJI.UOE\"R].1PS/0IR[<T0A.B3*?NFZ)=[<3<06EAB)??SSTU!.S:+K\";&2.V20[H'* UQD@*B^NAE3H$PS9($L--W9%L>YR&U4ZHE-\"8];E\"DOQ%[<\"=9LHHV) M)U,QJE9?;2@.E<=L>#A@MX4L$W3P7' =02K557UBDX8/G]%-Q#2M$=T,<9WH?$X9LI3C/ZS;=;E<![M(F=0Z? U!@K&D%TP$86CO7EI*?O2G'RP*H^4*2)H4!\"DBH[\\H/\"^W+AZJ8H(,+=OE;*9S]T3:F[I:)]GZ#]GS2++V4TU7(H O%+&I('9 $-+DDI\"\"$XXI;4V>A@U$>21A]DZ/<U*&U:X]\"Z+4)9D]WC:=@G@!/!Q<8U.MORBFB9<W!Q;POTR>W(6$*0[E--<G7K?BX2V&9KK&YY>U*$?!KI%)Z9T.OAPK5F-5S2ZK>J4'T85R?N8,K?>7=JZ!C\\J.(@SF?/]% J@VWER\\,]!JF.YH'64/FXEB4,, C5\"@OS.4X=]UA.59JWP=\\?8GQC662\"]U-Y%OQEGX#!V ZDGD0V>I)<I9&S8#*YJ0B#RUYD7W/%FQ4\"@%^ZA,CN4<0JRX+;5T0^7CRUQ18.5)P:]/J+0FC$:\\Q&]/6QY\"60%:>&>)LUO:%DE!!WK^0MMF>\"+,JILU:  B%;W6\\KHNQ%@NVR1+<6NQ7%9C0]'\\YP<E09V I=-HPI%;CS+";
export const XOR_KEY_LENGTH = 731;

/**
 * XOR key for the **fresh-account** save generation (period 731, printable
 * ASCII 32..94 like XOR_KEY, but a different key: only 13 of 731 bytes match
 * XOR_KEY and no rotation of it lines up).
 *
 * Recovered on 2026-11-22 from a live device save by the known-plaintext
 * statistical attack in ./key-recover.ts (byte-frequency model of the AUDB
 * format, one argmax per key index, decisive margins ~244 nats). Proven
 * against four save generations of the same account (198,081 / 198,105 /
 * 198,168 B) — each decodes to AUDB with 53 tables and re-encodes
 * byte-identically.
 *
 * It is tried after XOR_KEY and before statistical recovery, so the common
 * fresh-account case is instant. If a future build rotates the key again,
 * recovery still reads the save — this constant is an optimisation, not a
 * requirement.
 *
 * NOT verified as global: one account was available. Do not hand-edit.
 */
export const FRESH_KEY = "XDN,XD/#E1 ^K R$K2+9\"=(#6Q@NG,&2A1(ISA.S0+2E]J5AYK^<0+0P8X)UFI+['%\"RE'$+?^VXVL^O6>.992C@#=DX+4@R15?2AM=07T$!&)@6@\\=7B^.!RSV:\\-T=Y4CLROC'VXO^,1BD -2WIZH&$;]!8S W4.)-+I?J.F4O)([/I@<95F994 )*[7+\\G[&EX850C<;U#!.- L.-NA/;2V+P??+3I91JU\\IF^NH&6W-!B1)NPOOME%#)<'O\\0#]!FH%71S<-LT2ZTZLY%(,&.6LQ[^+IQ?2?2JE9B>P*8&S*S%KIZ](SYGIIO(:$V,)Q%-;\"&G+#T6[988^)O!)4@% 9&!5XYP>ZP$,LZ+95^&T-QHLE76!SZO/TS.FIKMA)280/2U2!3<@><7*7!,,K*).BG7KI42=BC)<+<6@AA.!^UCWML'#9BF8G##7EL)D+V3\\VCBM8+^R#X23NF'B&DX @X41OEN<W1JB07.+]<R\\!GU /-/W-9):V^2NU4Y- 3?EV<(HBIA?<JBGJ)W6B;;$AU51&S=E!)J.,,6ZQT[5EC,N:\\;;]L( #T2'8GMYDTV@R;JL$ZK*LC=4'FKM+&KM;-SJD*ASX*$36YP55?L(N].09IFO@L.E!J57QDN94.50*;I?1S3OIX=VL7*6?HL!2QS D:.\"X'&1 H\\Q*&EMT)XZ\"ZFDDSAL\\+E8*@H:7:%5E0Y@O(*73>CU\\8%MLZTP";
export const FRESH_KEY_LENGTH = 731;
export const FRESH_KEY_SHA256 = "b21acda0841fe1f98068dd3cc7441fdf07c8ede6985be89d379ad05d2ea48cd9";
