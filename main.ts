import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";

/** 설정 인터페이스 */
interface MarkdownBloggerSettings {
  projectFolders: string[];
  showHiddenFolders: boolean;
  convertToJekyllFormat: boolean;
}

/** 기본 설정값 */
const DEFAULT_SETTINGS: MarkdownBloggerSettings = {
  projectFolders: [""],
  showHiddenFolders: false,
  convertToJekyllFormat: false,
};

/** 파일 시스템 관련 유틸리티 클래스 */
class FileService {
  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  static readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  static writeFile(filePath: string, data: string): void {
    fs.writeFileSync(filePath, data, { encoding: "utf8" });
  }

  static listDirectory(currentPath: string): string[] {
    return fs.readdirSync(currentPath);
  }

  static getStats(fullPath: string): fs.Stats | undefined {
    try {
      return fs.statSync(fullPath, { throwIfNoEntry: false });
    } catch {
      return undefined;
    }
  }
}

/** 공통 에러 모달 */
class ErrorModal extends Modal {
  message: string;

  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText(this.message);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}


/** 설정 탭 클래스 */
class MarkdownBloggerSettingTab extends PluginSettingTab {
  plugin: MarkdownBlogger;

  constructor(app: App, plugin: MarkdownBlogger) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Markdown Blogger 설정" });

    // 프로젝트 폴더 경로 설정
    new Setting(containerEl)
      .setName("로컬 프로젝트 폴더 경로")
      .setDesc("블로그, 포트폴리오 또는 정적 사이트를 위한 로컬 프로젝트 폴더의 절대 경로를 선택하세요.")
      .addDropdown((dropdown) => {
        this.plugin.settings.projectFolders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.setValue(this.plugin.settings.projectFolders[0])
          .onChange(async (value) => {
            this.plugin.settings.projectFolders[0] = value;
            await this.plugin.saveSettings();
          });
      });

    // 경로 추가 버튼
    let newPath = "";
    new Setting(containerEl)
      .setName("경로 추가")
      .setDesc("새로운 프로젝트 폴더 경로를 추가합니다.")
      .addText((text) =>
        text.setPlaceholder("새 경로 입력")
          .onChange((value) => {
            newPath = value.trim().replace(/\s+/g, ' ');
          })
      )
      .addButton((button) =>
        button.setButtonText("추가")
          .onClick(async () => {
            if (newPath && !this.plugin.settings.projectFolders.includes(newPath)) {
              this.plugin.settings.projectFolders.push(newPath);
              await this.plugin.saveSettings();
              this.display(); // UI 업데이트
            }
          })
      );

    // 경로 삭제 버튼
    new Setting(containerEl)
      .setName("경로 삭제")
      .setDesc("선택된 프로젝트 폴더 경로를 삭제합니다.")
      .addDropdown((dropdown) => {
        this.plugin.settings.projectFolders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.setValue(this.plugin.settings.projectFolders[0])
          .onChange((value) => {
            this.plugin.settings.projectFolders[0] = value;
          });
      })
      .addButton((button) =>
        button.setButtonText("삭제")
          .onClick(async () => {
            const index = this.plugin.settings.projectFolders.indexOf(this.plugin.settings.projectFolders[0]);
            if (index > -1) {
              this.plugin.settings.projectFolders.splice(index, 1);
              await this.plugin.saveSettings();
              this.display(); // UI 업데이트
            }
          })
      );

    // 숨김 폴더 표시 설정
    new Setting(containerEl)
      .setName("숨김 폴더 표시")
      .setDesc("커스텀 경로로 푸시할 때 숨김 폴더를 표시할지 여부를 설정합니다.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showHiddenFolders)
          .onChange(async (value) => {
            this.plugin.settings.showHiddenFolders = value;
            await this.plugin.saveSettings();
          })
      );

    // 파일 이름 Jekyll 형식 변환
    new Setting(containerEl)
      .setName("파일 이름 Jekyll 형식 변환")
      .setDesc("파일 이름을 Jekyll 형식으로 변환할지 여부를 설정합니다.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertToJekyllFormat)
          .onChange(async (value) => {
            this.plugin.settings.convertToJekyllFormat = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

/** 메인 플러그인 클래스 */
export default class MarkdownBlogger extends Plugin {
  settings: MarkdownBloggerSettings;

  async onload() {
    await this.loadSettings();

    // 커맨드 등록
    this.registerCommands();

    // 설정 탭 추가
    this.addSettingTab(new MarkdownBloggerSettingTab(this.app, this));
  }

  onunload() {
    // 필요 시 정리 작업
  }

  /** 설정 로드 */
  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  /** 설정 저장 */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** 커맨드 등록 메서드 */
	private registerCommands() {

    this.addCommand({
      id: "validate-path",
      name: "경로 유효성 검사",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (!this.isProjectPathValid()) return;
        new Notice(`유효한 경로: ${this.settings.projectFolders[0]}`);
      },
    });

    this.addCommand({
      id: "push-md",
      name: "Markdown 푸시",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (!this.isProjectPathValid()) return;
        const file = view.file;
        if (file) {
          const targetPath = path.resolve(this.settings.projectFolders[0], file.name);
          this.pushFile(file, targetPath);
        }
      },
    });

		this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) {
          menu.addItem((item) => {
            item.setTitle("Markdown 푸시")
              .setIcon("upload")
              .onClick(() => {
                if (!this.isProjectPathValid()) return;
                const targetPath = path.resolve(this.settings.projectFolders[0], file.name);
                this.pushFile(file, targetPath);
              });
          });
        }
      })
    );
  }

  /** 프로젝트 경로 유효성 검사 */
  private isProjectPathValid(): boolean {
    const { projectFolders } = this.settings;
    if (!FileService.exists(projectFolders[0])) {
      new ErrorModal(this.app, "프로젝트 폴더가 존재하지 않습니다. 경로를 확인하거나 설정을 업데이트하세요.").open();
      return false;
    }
    return true;
  }

  /** 파일 푸시 메서드 */
	private async pushFile(file: TFile, targetPath: string) {
		console.log(targetPath);
    try {
      const fileContent = await this.app.vault.read(file);

      // 파일 이름 변환 로직 추가
      if (this.settings.convertToJekyllFormat) {
        const jekyllFileName = this.convertToJekyllFileName(file.name);
        targetPath = path.resolve(this.settings.projectFolders[0], jekyllFileName);
      }

      FileService.writeFile(targetPath, fileContent);
      new Notice(`파일이 성공적으로 푸시되었습니다: ${targetPath}`);
    } catch (error: any) {
      new Notice(`푸시 중 오류 발생: ${error.message}`);
    }
  }

  /** Jekyll 형식으로 파일 이름 변환 메서드 */
  private convertToJekyllFileName(fileName: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
    const nameWithoutExtension = path.parse(fileName).name;

    // 파일 이름에서 허용되지 않는 문자를 제거하고, 공백을 하이픈으로 대체
    const sanitizedTitle = nameWithoutExtension
      .replace(/[#?]/g, '') // 허용되지 않는 문자 제거
      .replace(/\s+/g, '-'); // 공백을 하이픈으로 대체

    return `${date}-${sanitizedTitle}.md`;
  }
}