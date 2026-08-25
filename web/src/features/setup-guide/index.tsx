/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  BadgeCheck,
  Check,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Laptop,
  Play,
  ShieldCheck,
} from 'lucide-react'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

const downloadPath = '/downloads/Aizzz-Codex-Setup-V0.0.2.exe'
const downloadName = 'Aizzz-Codex-Setup-V0.0.2.exe'
const downloadSha256 =
  '0104554358a23248cd124eb0a7342fb837e708dea61827d06d6324c6502a7173'

const quickSteps = [
  {
    title: '下载并运行',
    description: '下载 Windows 工具，双击后等待浏览器自动打开。',
    icon: ArrowDownToLine,
  },
  {
    title: '创建 API Key',
    description: '在控制台创建并复制一枚可用的 API Key。',
    icon: KeyRound,
  },
  {
    title: '一键配置',
    description: '粘贴 Key，保持自动代理，点击测试并一键配置。',
    icon: BadgeCheck,
  },
  {
    title: '启动 Codex',
    description: '看到 DONE 后启动 Codex，新建会话即可使用。',
    icon: Play,
  },
]

function ToolScreenshot(props: {
  src: string
  alt: string
  caption: string
  width: number
  height: number
  eager?: boolean
}) {
  return (
    <figure className='space-y-3'>
      <div className='border-border/80 bg-card overflow-hidden rounded-lg border shadow-sm'>
        <img
          src={props.src}
          alt={props.alt}
          width={props.width}
          height={props.height}
          loading={props.eager ? 'eager' : 'lazy'}
          className='h-auto w-full'
        />
      </div>
      <figcaption className='text-muted-foreground text-center text-xs leading-5'>
        {props.caption}
      </figcaption>
    </figure>
  )
}

function StepHeading(props: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className='grid gap-4 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-7'>
      <div className='border-primary/30 bg-primary/8 text-primary flex size-14 items-center justify-center rounded-lg border text-lg font-bold tabular-nums'>
        {props.number}
      </div>
      <div className='space-y-2'>
        <h2 className='text-2xl font-semibold'>{props.title}</h2>
        <p className='text-muted-foreground max-w-3xl text-sm leading-7 md:text-base'>
          {props.description}
        </p>
      </div>
    </div>
  )
}

function InstructionList({ children }: { children: React.ReactNode }) {
  return (
    <ol className='border-border/70 divide-border/70 divide-y border-y text-sm leading-7'>
      {children}
    </ol>
  )
}

function Instruction(props: { number: number; children: React.ReactNode }) {
  return (
    <li className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-4'>
      <span className='bg-foreground text-background mt-0.5 flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums'>
        {props.number}
      </span>
      <span>{props.children}</span>
    </li>
  )
}

export function SetupGuide() {
  return (
    <PublicLayout showMainContainer={false}>
      <div className='pt-16'>
        <section className='border-border/70 border-b'>
          <div className='container px-4 py-10 md:px-6 md:py-14'>
            <div className='mx-auto max-w-6xl'>
              <div className='text-primary mb-4 flex items-center gap-2 text-sm font-medium'>
                <Laptop className='size-4' aria-hidden='true' />
                Aizzz Codex Setup · Windows 64 位
              </div>
              <h1 className='max-w-4xl text-4xl font-semibold md:text-5xl'>
                轮椅配置教程
              </h1>
              <p className='text-muted-foreground mt-5 max-w-3xl text-base leading-8 md:text-lg'>
                从创建 API Key 到启动
                Codex，按页面顺序操作即可。工具会先测试连接，再备份并写入配置，不需要手动修改配置文件。
              </p>

              <div className='mt-7 flex flex-wrap gap-3'>
                <Button
                  size='lg'
                  className='h-11 px-4'
                  render={<a href={downloadPath} download={downloadName} />}
                >
                  <ArrowDownToLine data-icon='inline-start' />
                  下载 V0.0.2
                </Button>
                <Button
                  size='lg'
                  variant='outline'
                  className='h-11 px-4'
                  render={<Link to='/keys' />}
                >
                  <KeyRound data-icon='inline-start' />
                  直接创建 API Key
                </Button>
              </div>

              <dl className='border-border/70 mt-8 grid border-y py-5 text-sm sm:grid-cols-3'>
                <div className='py-2 sm:pr-5'>
                  <dt className='text-muted-foreground text-xs'>文件名</dt>
                  <dd className='mt-1 font-medium break-all'>{downloadName}</dd>
                </div>
                <div className='border-border/70 py-2 sm:border-x sm:px-5'>
                  <dt className='text-muted-foreground text-xs'>文件大小</dt>
                  <dd className='mt-1 font-medium'>11.55 MB</dd>
                </div>
                <div className='py-2 sm:pl-5'>
                  <dt className='text-muted-foreground text-xs'>版本</dt>
                  <dd className='mt-1 font-medium'>V0.0.2</dd>
                </div>
              </dl>

              <div className='mt-8'>
                <ToolScreenshot
                  src='/tutorial-assets/aizzz-codex-config.jpg'
                  alt='Aizzz Codex Setup 的 Codex 一键配置界面'
                  caption='运行工具后会自动打开这个本地页面。默认停留在 Codex 配置页。'
                  width={1265}
                  height={1070}
                  eager
                />
              </div>
            </div>
          </div>
        </section>

        <section className='border-border/70 bg-muted/20 border-b'>
          <div className='container px-4 py-12 md:px-6'>
            <div className='mx-auto max-w-6xl'>
              <div className='mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
                <div>
                  <p className='text-primary text-sm font-medium'>推荐路线</p>
                  <h2 className='mt-2 text-2xl font-semibold'>先完成这 4 步</h2>
                </div>
                <p className='text-muted-foreground text-sm'>
                  通常 3 分钟内完成
                </p>
              </div>
              <ol className='grid gap-3 md:grid-cols-4'>
                {quickSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <li
                      key={step.title}
                      className='border-border/70 bg-background min-h-40 rounded-lg border p-5'
                    >
                      <div className='flex items-center justify-between'>
                        <Icon
                          className='text-primary size-5'
                          aria-hidden='true'
                        />
                        <span className='text-muted-foreground text-xs tabular-nums'>
                          0{index + 1}
                        </span>
                      </div>
                      <h3 className='mt-6 text-base font-semibold'>
                        {step.title}
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm leading-6'>
                        {step.description}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        </section>

        <section className='border-border/70 border-b' id='step-1'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16'>
              <StepHeading
                number='01'
                title='下载并运行工具'
                description='安装包是单文件程序，不需要解压。建议先把它放到一个固定目录，再双击运行。'
              />
              <div className='space-y-6'>
                <InstructionList>
                  <Instruction number={1}>
                    点击本页的“下载 V0.0.2”，保存文件 {downloadName}。
                  </Instruction>
                  <Instruction number={2}>
                    双击运行
                    EXE，保持程序窗口开启，等待浏览器自动打开本地配置页。
                  </Instruction>
                  <Instruction number={3}>
                    页面右上角出现“本机引擎已连接”和本机 Codex
                    目录后，即可继续。
                  </Instruction>
                </InstructionList>
                <div className='flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 text-sm leading-6'>
                  <ShieldCheck
                    className='mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400'
                    aria-hidden='true'
                  />
                  <p>
                    Windows 出现安全提示时，先核对文件名与下方
                    SHA-256；确认一致后再选择“更多信息”并运行。
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground mb-2 text-xs'>SHA-256</p>
                  <code className='border-border/70 bg-muted/40 block rounded-md border px-3 py-3 text-xs leading-5 break-all'>
                    {downloadSha256}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='border-border/70 bg-muted/15 border-b' id='step-2'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16'>
              <StepHeading
                number='02'
                title='创建并复制 API Key'
                description='工具只需要一枚 API Key，其余地址、模型和供应商参数都已经预设。'
              />
              <div className='space-y-6'>
                <InstructionList>
                  <Instruction number={1}>
                    <Link
                      to='/keys'
                      className='text-primary font-medium hover:underline'
                    >
                      直接打开创建界面
                    </Link>
                    ，在弹出的界面中填写名称并保存。
                  </Instruction>
                  <Instruction number={2}>
                    创建完成后复制完整 Key，不要漏掉开头或结尾字符。
                  </Instruction>
                  <Instruction number={3}>
                    回到工具的 Codex 页，把 Key 粘贴到“OPENAI_API_KEY”输入框。
                  </Instruction>
                </InstructionList>
                <div className='flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-4 text-sm leading-6'>
                  <KeyRound
                    className='mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400'
                    aria-hidden='true'
                  />
                  <p>
                    API Key 只在本机工具中处理。请勿把 Key
                    发给他人，也不要把包含完整 Key 的截图上传到公开页面。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='border-border/70 border-b' id='step-3'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto max-w-6xl space-y-10'>
              <StepHeading
                number='03'
                title='测试并一键配置 Codex'
                description='推荐保持默认设置：代理选择“自动读取系统代理”，认证方式选择“环境变量（默认）”。'
              />
              <div className='grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-start'>
                <ToolScreenshot
                  src='/tutorial-assets/aizzz-codex-config.jpg'
                  alt='Codex 配置页的 API Key 输入框和一键配置按钮'
                  caption='粘贴 Key 后点击左侧绿色的“测试并一键配置”。'
                  width={1265}
                  height={1070}
                />
                <InstructionList>
                  <Instruction number={1}>
                    代理模式保持“自动读取系统代理”。连接失败时再切换为手动代理或直连。
                  </Instruction>
                  <Instruction number={2}>
                    认证方式保持“环境变量（默认）”；只有明确需要时才切换到
                    auth.json。
                  </Instruction>
                  <Instruction number={3}>
                    点击“测试并一键配置”，等待状态变为“配置完成 / DONE”。
                  </Instruction>
                  <Instruction number={4}>
                    工具会自动测试连接、建立备份、更新配置并迁移历史会话索引。
                  </Instruction>
                </InstructionList>
              </div>
            </div>
          </div>
        </section>

        <section className='border-border/70 bg-muted/15 border-b' id='step-4'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto max-w-6xl space-y-10'>
              <StepHeading
                number='04'
                title='启动 Codex 并完成检查'
                description='配置显示 DONE 后，直接在工具里启动 Codex。首次使用还可以顺手检查安装和插件状态。'
              />
              <div className='grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-start'>
                <InstructionList>
                  <Instruction number={1}>
                    回到 Codex 页，点击“启动 Codex”。
                  </Instruction>
                  <Instruction number={2}>
                    打开一个新会话并发送简单消息，确认回复正常。
                  </Instruction>
                  <Instruction number={3}>
                    如果还没安装桌面版，打开“安装
                    Codex”页，使用自动安装或选择官方安装包。
                  </Instruction>
                  <Instruction number={4}>
                    插件列表异常时，点击“初始化 / 修复插件”，完成后再启动
                    Codex。
                  </Instruction>
                </InstructionList>
                <ToolScreenshot
                  src='/tutorial-assets/aizzz-codex-install.jpg'
                  alt='Codex 安装状态和插件初始化页面'
                  caption='安装页会显示桌面版、首次启动状态和插件市场是否就绪。'
                  width={1265}
                  height={768}
                />
              </div>
              <div className='border-primary/25 bg-primary/6 flex flex-col justify-between gap-4 rounded-lg border p-5 sm:flex-row sm:items-center'>
                <div className='flex gap-3'>
                  <BadgeCheck
                    className='text-primary mt-0.5 size-6 shrink-0'
                    aria-hidden='true'
                  />
                  <div>
                    <h3 className='font-semibold'>看到这些状态就算完成</h3>
                    <p className='text-muted-foreground mt-1 text-sm leading-6'>
                      配置完成 / DONE、Codex 已启动，以及新会话能够正常回复。
                    </p>
                  </div>
                </div>
                <Button
                  render={<a href={downloadPath} download={downloadName} />}
                >
                  <ArrowDownToLine data-icon='inline-start' />
                  重新下载工具
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className='border-border/70 border-b'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto max-w-6xl space-y-10'>
              <div className='max-w-3xl'>
                <p className='text-primary text-sm font-medium'>可选功能</p>
                <h2 className='mt-2 text-2xl font-semibold'>同时配置 Hermes</h2>
                <p className='text-muted-foreground mt-3 text-sm leading-7 md:text-base'>
                  使用 Hermes 时切换到对应页，粘贴同一枚 API
                  Key，点击“测试并配置 Hermes”。工具会写入本机
                  config.yaml，并在修改前备份原文件。
                </p>
              </div>
              <ToolScreenshot
                src='/tutorial-assets/aizzz-hermes-config.jpg'
                alt='Hermes 一键配置页面'
                caption='Hermes 是可选项，不影响 Codex 的配置流程。'
                width={1265}
                height={875}
              />
            </div>
          </div>
        </section>

        <section className='border-border/70 bg-muted/20 border-b'>
          <div className='container px-4 py-14 md:px-6 md:py-20'>
            <div className='mx-auto max-w-4xl'>
              <div className='mb-8'>
                <p className='text-primary text-sm font-medium'>常见问题</p>
                <h2 className='mt-2 text-2xl font-semibold'>
                  遇到问题先看这里
                </h2>
              </div>
              <div className='border-border/70 divide-border/70 bg-background divide-y rounded-lg border'>
                <details className='group p-5'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-4 font-medium'>
                    页面显示“Failed to fetch”或“本地引擎连接失败”
                    <ChevronDown className='size-4 shrink-0 transition-transform group-open:rotate-180' />
                  </summary>
                  <p className='text-muted-foreground mt-3 text-sm leading-7'>
                    关闭旧网页和旧工具，重新双击
                    EXE，只使用它本次自动打开的新页面。工具程序必须保持运行。
                  </p>
                </details>
                <details className='group p-5'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-4 font-medium'>
                    连接测试失败
                    <ChevronDown className='size-4 shrink-0 transition-transform group-open:rotate-180' />
                  </summary>
                  <p className='text-muted-foreground mt-3 text-sm leading-7'>
                    先保持“自动读取系统代理”。仍失败时切换“手动代理地址”，填写本机代理地址；不需要代理的网络可切换为“直连”。同时确认
                    API Key 完整且仍然有效。
                  </p>
                </details>
                <details className='group p-5'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-4 font-medium'>
                    配置后 Codex 仍显示登录页或插件不可用
                    <ChevronDown className='size-4 shrink-0 transition-transform group-open:rotate-180' />
                  </summary>
                  <p className='text-muted-foreground mt-3 text-sm leading-7'>
                    打开“安装 Codex”页，点击“初始化 /
                    修复插件”，完成后从工具内再次启动 Codex。
                  </p>
                </details>
                <details className='group p-5'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-4 font-medium'>
                    想恢复配置前的状态
                    <ChevronDown className='size-4 shrink-0 transition-transform group-open:rotate-180' />
                  </summary>
                  <p className='text-muted-foreground mt-3 text-sm leading-7'>
                    先关闭 Codex，再回到工具的 Codex
                    页点击“恢复最近备份”。备份位于工具同目录的 backup 文件夹。
                  </p>
                </details>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className='container px-4 py-12 md:px-6'>
            <div className='border-border/70 bg-card mx-auto flex max-w-6xl flex-col justify-between gap-6 rounded-lg border p-6 shadow-sm md:flex-row md:items-center md:p-8'>
              <div>
                <div className='flex items-center gap-2 font-semibold'>
                  <Check className='size-5 text-emerald-600 dark:text-emerald-400' />
                  准备好后，从下载工具开始
                </div>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                  下载、创建 Key、测试并配置、启动 Codex，四步即可完成。
                </p>
              </div>
              <div className='flex flex-wrap gap-3'>
                <Button
                  size='lg'
                  render={<a href={downloadPath} download={downloadName} />}
                >
                  <ArrowDownToLine data-icon='inline-start' />
                  下载 V0.0.2
                </Button>
                <Button
                  size='lg'
                  variant='outline'
                  render={<Link to='/keys' />}
                >
                  <ExternalLink data-icon='inline-start' />
                  直接创建 API Key
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  )
}
